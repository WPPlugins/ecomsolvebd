<?php
/**
 * Tier 2 enterprise capture — server-side (PHP) landing snapshot on `template_redirect`, i.e.
 * before WordPress renders any template, before the theme's `wp_head`/`wp_footer` runs, and
 * therefore before a single line of browser JavaScript (tracker, GTM, pixels, consent banners)
 * ever executes. This closes the last gap client-side capture cannot: if the visitor's browser
 * crashes, kills scripts (some in-app browsers), or blocks JS entirely right after the ad click,
 * the landing snapshot is already written server-side by the time that happens.
 *
 * Mirrors `web/src/lib/storefront/edge-landing-capture.ts` (the hosted-storefront equivalent in
 * the Next.js proxy) and reuses the *same* visitor-id cookie the bundled tracker already reads
 * (`tracker/src/visitor-id.js` + `storage-keys.js`: `fct_uid` + `_{siteKey}` when set) — so once
 * the real tracker boots later it adopts the same id and continues the same visitor/journey.
 * Ships through the existing `/v1/tracking/collect` pipeline (via `ECOMSO_First_Party::proxy_post`)
 * — not a parallel/divergent write path.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Server_Precapture {

	private const ID_CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';
	private const ID_LENGTH  = 6;
	private const UID_COOKIE_MAX_AGE = 60 * 60 * 24 * 730; // ~2 years, matches tracker default.

	/** Superset of `tracker/src/query-params.js` known click-id keys (kept in sync manually). */
	private const CLICK_ID_KEYS = array(
		'fbclid',
		'gclid',
		'dclid',
		'ttclid',
		'msclkid',
		'li_fat_id',
		'epik',
		'twclid',
		'gbraid',
		'wbraid',
	);

	public static function init(): void {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_capture' ), 1 );
	}

	public static function maybe_capture(): void {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || defined( 'REST_REQUEST' ) ) {
			return;
		}
		if ( ! isset( $_SERVER['REQUEST_METHOD'] ) || 'GET' !== $_SERVER['REQUEST_METHOD'] ) {
			return;
		}
		if ( ! class_exists( 'ECOMSO_Admin' ) || ! class_exists( 'ECOMSO_First_Party' ) || ! class_exists( 'ECOMSO_Config' ) ) {
			return;
		}

		$stored = get_option( 'ecomso_settings', array() );
		$s      = ECOMSO_Config::merge_settings( is_array( $stored ) ? $stored : array() );
		if ( empty( $s['server_precapture_enabled'] ) ) {
			return;
		}
		if ( ! ECOMSO_Admin::is_storefront_tracking_enabled() ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only attribution capture, no state mutation.
		$query = self::sanitize_query_params( isset( $_GET ) && is_array( $_GET ) ? $_GET : array() );
		if ( ! self::query_has_attribution_signal( $query ) ) {
			return;
		}

		$site_key    = isset( $s['site_key'] ) ? sanitize_text_field( (string) $s['site_key'] ) : '';
		$merchant_id = isset( $s['merchant_id'] ) ? trim( (string) $s['merchant_id'] ) : '';
		$api_base    = isset( $s['api_base'] ) ? (string) $s['api_base'] : '';
		if ( $merchant_id === '' || $api_base === '' ) {
			return;
		}

		$cookie_name = self::cookie_name( $site_key );
		$existing    = isset( $_COOKIE[ $cookie_name ] )
			? sanitize_text_field( wp_unslash( (string) $_COOKIE[ $cookie_name ] ) )
			: '';
		$user_id     = self::is_valid_id( $existing ) ? $existing : self::generate_id();

		if ( ! self::is_valid_id( $existing ) && ! headers_sent() ) {
			self::set_uid_cookie( $cookie_name, $user_id );
		}

		$href     = self::current_url();
		$referrer = isset( $_SERVER['HTTP_REFERER'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_REFERER'] ) ) : '';
		$parsed   = self::parse_attribution( $query );

		$now_iso = gmdate( 'c' );
                $body    = array(
                        'event'                  => 'edge_landing_capture',
                        'timestamp'              => $now_iso,
                        'user_id'                => $user_id,
                        'site_key'               => $site_key !== '' ? $site_key : null,
                        'url'                    => $href,
                        'referrer'               => $referrer !== '' ? $referrer : null,
                        'click_ids'              => $parsed['click_ids'],
                        'utm'                    => $parsed['utm'],
                        'raw_query_params'       => $parsed['raw'],
                        'normalized_click_ids'   => $parsed['click_ids'],
                        'normalized_attribution' => $parsed['attribution'],
                        'first_touch'            => array(
                                'occurredAt'              => $now_iso,
                                'landingUrl'              => $href,
                                'referrer'                => $referrer !== '' ? $referrer : null,
                                'clickIds'                => $parsed['click_ids'],
                                'utm'                     => $parsed['utm'],
                                'raw_query_params'        => $parsed['raw'],
                                'normalized_click_ids'    => $parsed['click_ids'],
                                'normalized_attribution'  => $parsed['attribution'],
                        ),
                );

		$client_ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_USER_AGENT'] ) ) : '';

		// Fire-and-forget: never delays the real page render (see ECOMSO_First_Party::proxy_post $blocking=false).
		ECOMSO_First_Party::proxy_post(
			'/v1/tracking/collect',
			(string) wp_json_encode( $body ),
			$api_base,
			$merchant_id,
			$client_ua !== '' ? $client_ua : null,
			array(),
			false
		);
	}

	/** @param array<string,mixed> $query */
	private static function sanitize_query_params( array $query ): array {
		$clean = array();
		foreach ( $query as $key => $value ) {
			if ( ! is_string( $key ) || is_array( $value ) ) {
				continue;
			}
			$safe_key = sanitize_key( $key );
			if ( $safe_key === '' ) {
				continue;
			}
			$clean[ $safe_key ] = $value;
		}
		return $clean;
	}

	/** @param array<string,mixed> $query */
	private static function query_has_attribution_signal( array $query ): bool {
		foreach ( array_keys( $query ) as $key ) {
			$lower = strtolower( (string) $key );
			if ( self::is_utm_key( $lower ) || self::is_click_id_key( $lower ) ) {
				return true;
			}
		}
		return false;
	}

	private static function is_utm_key( string $lower ): bool {
		return 0 === strpos( $lower, 'utm_' ) || 'gclsrc' === $lower || 'srsltid' === $lower || 'ref' === $lower;
	}

	private static function is_click_id_key( string $lower ): bool {
		if ( 0 === strpos( $lower, 'utm_' ) ) {
			return false;
		}
		if ( in_array( $lower, self::CLICK_ID_KEYS, true ) ) {
			return true;
		}
		if ( strlen( $lower ) >= 5 && ( self::ends_with( $lower, 'clid' ) || self::ends_with( $lower, '_cid' ) ) ) {
			return true;
		}
		return false !== strpos( $lower, 'clickid' ) || false !== strpos( $lower, 'click_id' );
	}

	private static function ends_with( string $haystack, string $needle ): bool {
		$len = strlen( $needle );
		return $len === 0 || substr( $haystack, -$len ) === $needle;
	}

	/**
	 * @param array<string,mixed> $query
	 * @return array{click_ids: array<string,string>, utm: array<string,string>, attribution: array<string,string>, raw: array<string,string>}
	 */
	private static function parse_attribution( array $query ): array {
		$click_ids   = array();
		$utm         = array();
		$attribution = array();
		$raw         = array();

		foreach ( $query as $key => $value ) {
			if ( ! is_string( $key ) || is_array( $value ) ) {
				continue;
			}
			$safe_key = sanitize_key( $key );
			if ( $safe_key === '' ) {
				continue;
			}
			$v = trim( sanitize_text_field( wp_unslash( (string) $value ) ) );
			if ( $v === '' ) {
				continue;
			}
			$raw[ $safe_key ] = $v;

			$lower = strtolower( $safe_key );
			if ( self::is_click_id_key( $lower ) && ! isset( $click_ids[ $lower ] ) ) {
				$click_ids[ $lower ] = $v;
			}
			if ( self::is_utm_key( $lower ) && ! isset( $attribution[ $lower ] ) ) {
				$attribution[ $lower ] = $v;
				if ( 0 === strpos( $lower, 'utm_' ) ) {
					$utm[ $lower ] = $v;
				}
			}
		}

		return array(
			'click_ids'   => $click_ids,
			'utm'         => $utm,
			'attribution' => $attribution,
			'raw'         => $raw,
		);
	}

	private static function cookie_name( string $site_key ): string {
		$sk = ( $site_key !== '' && preg_match( '/^[a-zA-Z0-9_-]{1,32}$/', $site_key ) ) ? '_' . $site_key : '';
		return 'fct_uid' . $sk;
	}

	private static function is_valid_id( string $id ): bool {
		return (bool) preg_match( '/^[a-z0-9]{5,8}$/', $id );
	}

	private static function generate_id(): string {
		$charset = self::ID_CHARSET;
		$max     = strlen( $charset ) - 1;
		$out     = '';
		for ( $i = 0; $i < self::ID_LENGTH; $i++ ) {
			try {
				$out .= $charset[ random_int( 0, $max ) ];
			} catch ( \Exception $e ) {
				$out .= $charset[ array_rand( str_split( $charset ) ) ];
			}
		}
		return $out;
	}

	private static function set_uid_cookie( string $name, string $value ): void {
		$secure = is_ssl();
		if ( PHP_VERSION_ID >= 70300 ) {
			setcookie(
				$name,
				$value,
				array(
					'expires'  => time() + self::UID_COOKIE_MAX_AGE,
					'path'     => '/',
					'samesite' => 'Lax',
					'secure'   => $secure,
					'httponly' => false,
				)
			);
		} else {
			setcookie( $name, $value, time() + self::UID_COOKIE_MAX_AGE, '/', '', $secure, false ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_manipulation
		}
		$_COOKIE[ $name ] = $value;
	}

	private static function current_url(): string {
		$scheme = is_ssl() ? 'https' : 'http';
		$host   = isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_HOST'] ) ) : '';
		$uri    = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['REQUEST_URI'] ) ) : '/';
		if ( $host === '' && function_exists( 'home_url' ) ) {
			return home_url( $uri );
		}
		return $scheme . '://' . $host . $uri;
	}
}
