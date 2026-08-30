<?php
/**
 * First-party ingest: same-origin WP proxy + optional custom tracking subdomain (DNS).
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_First_Party {

	/** CNAME target merchants point `tracking.{store}` at (EcomSolveBD collect edge). */
	public const CNAME_TARGET = 'collect.ecomsolvebd.com';

	/**
	 * Pull first-party hostname + verified flag from SaaS (Integrations hub owns Verify).
	 */
	public static function sync_from_saas(): void {
		$stored = get_option( 'ecomso_settings', array() );
		$stored = is_array( $stored ) ? $stored : array();
		if ( class_exists( 'ECOMSO_Config' ) ) {
			$stored = ECOMSO_Config::merge_settings( $stored );
		}
		$mid = isset( $stored['merchant_id'] ) ? trim( (string) $stored['merchant_id'] ) : '';
		$api = isset( $stored['api_base'] ) ? (string) $stored['api_base'] : '';
		if ( $mid === '' || $api === '' || ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return;
		}

		$cache_key = 'ecomso_fp_saas_' . md5( $mid );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && isset( $cached['trackingHostname'] ) ) {
			self::apply_saas_first_party( $stored, $cached );
			return;
		}

		$base = ECOMSO_Enqueue::normalize_api_base( $api );
		if ( $base === '' ) {
			return;
		}
		$url = $base . '/v1/woocommerce/plugin-first-party?key=' . rawurlencode( $mid );
		$res = wp_remote_get(
			$url,
			array(
				'timeout' => 8,
				'headers' => array(
					'Accept'         => 'application/json',
					'x-merchant-key' => $mid,
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $json ) || empty( $json['ok'] ) || ! is_array( $json['data'] ?? null ) ) {
			return;
		}
		/** @var array<string,mixed> $data */
		$data = $json['data'];
		set_transient( $cache_key, $data, 60 );
		self::apply_saas_first_party( $stored, $data );
	}

	/**
	 * @param array<string,mixed> $stored
	 * @param array<string,mixed> $remote
	 */
	private static function apply_saas_first_party( array $stored, array $remote ): void {
		$changed = false;
		if ( isset( $remote['firstPartyMode'] ) ) {
			$mode = (string) $remote['firstPartyMode'] === 'custom' ? 'custom' : 'auto';
			if ( ( $stored['first_party_mode'] ?? '' ) !== $mode ) {
				$stored['first_party_mode'] = $mode;
				$changed                    = true;
			}
		}
		if ( isset( $remote['trackingSubdomainLabel'] ) ) {
			$label = self::sanitize_subdomain_label( (string) $remote['trackingSubdomainLabel'] );
			if ( $label !== '' && ( $stored['tracking_subdomain_label'] ?? '' ) !== $label ) {
				$stored['tracking_subdomain_label'] = $label;
				$changed                            = true;
			}
		}
		if ( isset( $remote['trackingHostname'] ) ) {
			$host = self::normalize_hostname( (string) $remote['trackingHostname'] );
			if ( $host !== '' && ( $stored['tracking_hostname'] ?? '' ) !== $host ) {
				$stored['tracking_hostname'] = $host;
				$changed                     = true;
			}
		}
		if ( array_key_exists( 'trackingHostnameVerified', $remote ) ) {
			$ver = ! empty( $remote['trackingHostnameVerified'] );
			if ( ! empty( $stored['tracking_hostname_verified'] ) !== $ver ) {
				$stored['tracking_hostname_verified'] = $ver;
				$changed                              = true;
			}
		}
		if ( $changed ) {
			update_option( 'ecomso_settings', $stored, false );
			if ( class_exists( 'ECOMSO_Cache' ) ) {
				ECOMSO_Cache::bust_storefront();
			}
		}
	}

	/**
	 * Browser-facing ingest + attribution URLs and fetch credentials.
	 *
	 * @param array<string,mixed> $settings ecomso_settings row.
	 * @return array{
	 *   endpoint:string,
	 *   attributionConfigUrl:string,
	 *   ingestMode:string,
	 *   credentials:string,
	 *   trackingHostname:string
	 * }
	 */
	public static function browser_endpoints( array $settings ): array {
		$merchant_id = isset( $settings['merchant_id'] ) ? trim( (string) $settings['merchant_id'] ) : '';
		$api_base    = isset( $settings['api_base'] ) ? (string) $settings['api_base'] : '';
		$mode        = isset( $settings['first_party_mode'] ) ? (string) $settings['first_party_mode'] : 'auto';
		$hostname    = self::normalize_hostname( isset( $settings['tracking_hostname'] ) ? (string) $settings['tracking_hostname'] : '' );
		$verified    = ! empty( $settings['tracking_hostname_verified'] ) && $hostname !== '';

		$use_master = ! empty( $settings['use_master_ingest'] );
		$path       = $use_master ? '/v1/events/master-ingest' : '/v1/tracking/collect';
		$attr_path  = '/v1/tracking/attribution-config';

		// Preferred: custom tracking subdomain after DNS verify (auto or custom-only mode).
		if ( ( 'custom' === $mode || 'auto' === $mode ) && $verified && $hostname !== '' ) {
			$custom_base = 'https://' . $hostname . '/api';
			return array(
				'endpoint'             => ECOMSO_Enqueue::ingest_url_with_key( $path, $custom_base, $merchant_id ),
				'attributionConfigUrl' => ECOMSO_Enqueue::ingest_url_with_key( $attr_path, $custom_base, $merchant_id ),
				'ingestMode'           => 'custom_subdomain',
				'credentials'          => 'omit',
				'trackingHostname'     => $hostname,
			);
		}

		// Auto (and custom without DNS): Direct API — shared Core CORS + outbox/retry.
		// WP REST store_proxy kept for back-compat if old configs still call it.
		return array(
			'endpoint'             => ECOMSO_Enqueue::ingest_url_with_key( $path, $api_base, $merchant_id ),
			'attributionConfigUrl' => ECOMSO_Enqueue::ingest_url_with_key( $attr_path, $api_base, $merchant_id ),
			'ingestMode'           => 'direct_api',
			'credentials'          => 'omit',
			'trackingHostname'     => '',
		);
	}

	/**
	 * @param string $rest_route e.g. ecomso/v1/ingest
	 */
	public static function rest_url_with_key( string $rest_route, string $merchant_id ): string {
		$url = rest_url( $rest_route );
		if ( $merchant_id === '' ) {
			return $url;
		}
		return add_query_arg( 'key', rawurlencode( $merchant_id ), $url );
	}

	public static function normalize_hostname( string $raw ): string {
		$t = strtolower( trim( $raw ) );
		if ( $t === '' ) {
			return '';
		}
		$t = preg_replace( '#^https?://#', '', $t );
		$t = preg_replace( '#/.*$#', '', (string) $t );
		$t = rtrim( (string) $t, '.' );
		if ( ! preg_match( '/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i', $t ) ) {
			return '';
		}
		return $t;
	}

	/** Storefront host from home_url (e.g. shop.example.com). */
	public static function store_base_domain(): string {
		if ( ! function_exists( 'home_url' ) ) {
			return '';
		}
		$parsed = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		$host   = is_string( $parsed ) ? strtolower( trim( $parsed ) ) : '';
		if ( 0 === strpos( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
	}

	public static function default_subdomain_label(): string {
		return 'example';
	}

	/** User-facing prefix only (e.g. tracking). */
	public static function sanitize_subdomain_label( string $raw ): string {
		$t = strtolower( trim( $raw ) );
		$t = preg_replace( '#^https?://#', '', $t );
		$t = preg_replace( '#/.*$#', '', (string) $t );
		if ( false !== strpos( $t, '.' ) ) {
			$parts = explode( '.', $t );
			$t     = (string) ( $parts[0] ?? '' );
		}
		$t = preg_replace( '/[^a-z0-9-]/', '', $t );
		$t = trim( $t, '-' );
		if ( strlen( $t ) > 32 ) {
			$t = substr( $t, 0, 32 );
		}
		return $t;
	}

	public static function hostname_from_label( string $label ): string {
		$label = self::sanitize_subdomain_label( $label );
		$base  = self::store_base_domain();
		if ( $label === '' || $base === '' ) {
			return '';
		}
		return self::normalize_hostname( $label . '.' . $base );
	}

	public static function subdomain_label_from_hostname( string $hostname ): string {
		$hostname = self::normalize_hostname( $hostname );
		$base     = self::store_base_domain();
		if ( $hostname === '' ) {
			return '';
		}
		if ( $base !== '' && self::host_ends_with( $hostname, $base ) ) {
			$prefix = substr( $hostname, 0, -strlen( $base ) - 1 );
			return self::sanitize_subdomain_label( $prefix );
		}
		$parts = explode( '.', $hostname );
		return self::sanitize_subdomain_label( (string) ( $parts[0] ?? '' ) );
	}

	/** Suggested hostname: tracking.example.com */
	public static function suggested_tracking_hostname(): string {
		$base = self::store_base_domain();
		if ( $base === '' ) {
			return 'tracking.yourstore.com';
		}
		return self::hostname_from_label( self::default_subdomain_label() );
	}

	/**
	 * DNS rows for admin UI (each value copyable).
	 *
	 * @return array<int, array{label:string,value:string,note?:string}>
	 */
	public static function dns_record_rows( string $label ): array {
		$label    = self::sanitize_subdomain_label( $label );
		$full     = self::hostname_from_label( $label );
		$target   = self::CNAME_TARGET;
		$base     = self::store_base_domain();
		$host_alt = $label;
		if ( $base !== '' && false !== strpos( $base, '.' ) ) {
			$first = explode( '.', $base )[0];
			if ( $first !== '' ) {
				$host_alt = $label . '.' . $first;
			}
		}
		return array(
			array(
				'id'    => 'type',
				'label' => __( 'Record type', 'ecomsolvebd' ),
				'value' => 'CNAME',
			),
			array(
				'id'    => 'host_store',
				'label' => __( 'Host / Name (most stores)', 'ecomsolvebd' ),
				'value' => $host_alt,
				'note'  => __( 'Use when your DNS zone is the root domain (e.g. example.com).', 'ecomsolvebd' ),
			),
			array(
				'id'    => 'host_root',
				'label' => __( 'Host / Name (store subdomain zone)', 'ecomsolvebd' ),
				'value' => $label,
				'note'  => __( 'Use when your DNS zone is the store host only (e.g. shop.example.com).', 'ecomsolvebd' ),
			),
			array(
				'id'    => 'target',
				'label' => __( 'Points to / Target', 'ecomsolvebd' ),
				'value' => $target,
			),
			array(
				'id'    => 'full',
				'label' => __( 'Full tracking domain (after DNS)', 'ecomsolvebd' ),
				'value' => $full,
			),
		);
	}

	/**
	 * @return array{ ok: bool, message: string, target: string }
	 */
	public static function verify_dns( string $hostname ): array {
		$hostname = self::normalize_hostname( $hostname );
		$target   = strtolower( self::CNAME_TARGET );
		if ( $hostname === '' ) {
			return array(
				'ok'      => false,
				'message' => __( 'Enter a hostname such as tracking.yourstore.com.', 'ecomsolvebd' ),
				'target'  => $target,
			);
		}

		$seen_target = false;

		// 1) Local PHP DNS (often broken/filtered on managed WP hosts).
		if ( function_exists( 'dns_get_record' ) ) {
			$cnames = @dns_get_record( $hostname, DNS_CNAME ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( is_array( $cnames ) ) {
				foreach ( $cnames as $row ) {
					if ( ! is_array( $row ) || empty( $row['target'] ) ) {
						continue;
					}
					$t = strtolower( rtrim( (string) $row['target'], '.' ) );
					if ( $t === $target || self::host_ends_with( $t, $target ) ) {
						$seen_target = true;
						break;
					}
				}
			}

			if ( ! $seen_target ) {
				$aliases     = @dns_get_record( $hostname, DNS_CNAME + DNS_A ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				$target_ips  = array();
				$host_ips    = array();
				if ( is_array( $aliases ) ) {
					foreach ( $aliases as $row ) {
						if ( is_array( $row ) && isset( $row['ip'] ) ) {
							$host_ips[] = (string) $row['ip'];
						}
					}
				}
				$target_rows = @dns_get_record( $target, DNS_A ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				if ( is_array( $target_rows ) ) {
					foreach ( $target_rows as $row ) {
						if ( is_array( $row ) && isset( $row['ip'] ) ) {
							$target_ips[] = (string) $row['ip'];
						}
					}
				}
				if ( $host_ips && $target_ips && array_intersect( $host_ips, $target_ips ) ) {
					$seen_target = true;
				}
			}
		}

		// 2) Public DNS-over-HTTPS (Cloudflare) — hosts that block/empty dns_get_record still verify.
		if ( ! $seen_target ) {
			$seen_target = self::cname_points_to_target_doh( $hostname, $target );
		}

		// 3) SaaS API DNS check (same resolvers as collect edge provision).
		if ( ! $seen_target ) {
			$remote = self::cname_points_to_target_via_api( $hostname );
			if ( ! empty( $remote['ok'] ) ) {
				$seen_target = true;
			}
		}

		if ( $seen_target ) {
			$edge = self::ensure_collect_hostname_via_api( $hostname );
			if ( empty( $edge['skipped'] ) && empty( $edge['ok'] ) && ! empty( $edge['message'] ) ) {
				// API reachable but provision failed — surface that; still try HTTPS in case hostname already exists.
			}

			$https = self::probe_tracking_https_with_retries( $hostname, 4, 2 );
			if ( empty( $https['ok'] ) ) {
				$extra = '';
				if ( ! empty( $edge['message'] ) ) {
					$extra = ' ' . (string) $edge['message'];
				}
				return array(
					'ok'      => false,
					'message' => ( isset( $https['message'] ) ? (string) $https['message'] : __( 'HTTPS to tracking subdomain failed.', 'ecomsolvebd' ) ) . $extra,
					'target'  => $target,
				);
			}
			$msg = __( 'DNS looks correct.', 'ecomsolvebd' );
			if ( ! empty( $edge['created'] ) ) {
				$msg = __( 'DNS OK — Custom Hostname auto-created on EcomSolveBD collect edge. HTTPS OK.', 'ecomsolvebd' );
			} elseif ( ! empty( $edge['ok'] ) ) {
				$msg = __( 'DNS OK — collect edge ready. HTTPS OK.', 'ecomsolvebd' );
			}
			return array(
				'ok'      => true,
				'message' => $msg,
				'target'  => $target,
			);
		}

		return array(
			'ok'      => false,
			'message' => sprintf(
				/* translators: 1: hostname, 2: CNAME target */
				__( 'No CNAME for %1$s pointing to %2$s yet. Add the record at your DNS host and wait a few minutes.', 'ecomsolvebd' ),
				$hostname,
				$target
			),
			'target'  => $target,
		);
	}

	/** Cloudflare DNS-over-HTTPS CNAME check (bypasses broken hosting resolvers). */
	public static function cname_points_to_target_doh( string $hostname, string $target ): bool {
		$hostname = self::normalize_hostname( $hostname );
		$target   = strtolower( rtrim( $target, '.' ) );
		if ( $hostname === '' || $target === '' ) {
			return false;
		}
		$url = 'https://cloudflare-dns.com/dns-query?name=' . rawurlencode( $hostname ) . '&type=CNAME';
		$res = wp_remote_get(
			$url,
			array(
				'timeout' => 8,
				'headers' => array(
					'Accept' => 'application/dns-json',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return false;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( $code < 200 || $code >= 300 ) {
			return false;
		}
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $json ) || empty( $json['Answer'] ) || ! is_array( $json['Answer'] ) ) {
			return false;
		}
		foreach ( $json['Answer'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			// type 5 = CNAME
			if ( isset( $row['type'] ) && (int) $row['type'] !== 5 ) {
				continue;
			}
			$data = isset( $row['data'] ) ? strtolower( rtrim( (string) $row['data'], '.' ) ) : '';
			if ( $data === $target || self::host_ends_with( $data, $target ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Ask SaaS whether CNAME is visible (API DNS), without requiring HTTPS yet.
	 *
	 * @return array{ ok: bool, message?: string }
	 */
	public static function cname_points_to_target_via_api( string $hostname ): array {
		$hostname = self::normalize_hostname( $hostname );
		$stored   = get_option( 'ecomso_settings', array() );
		$stored   = is_array( $stored ) ? $stored : array();
		if ( class_exists( 'ECOMSO_Config' ) ) {
			$stored = ECOMSO_Config::merge_settings( $stored );
		}
		$mid = isset( $stored['merchant_id'] ) ? trim( (string) $stored['merchant_id'] ) : '';
		$api = isset( $stored['api_base'] ) ? (string) $stored['api_base'] : '';
		if ( $mid === '' || $api === '' || ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return array( 'ok' => false );
		}
		$url = ECOMSO_Enqueue::ingest_url_with_key( '/v1/tracking/check-collect-cname', $api, $mid );
		if ( $url === '' ) {
			return array( 'ok' => false );
		}
		$res = wp_remote_post(
			$url,
			array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type'   => 'application/json',
					'Accept'         => 'application/json',
					'x-merchant-key' => $mid,
				),
				'body'    => wp_json_encode( array( 'hostname' => $hostname ) ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'message' => $res->get_error_message() );
		}
		$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		$ok   = is_array( $json ) && ! empty( $json['ok'] );
		return array(
			'ok'      => $ok,
			'message' => is_array( $json ) && isset( $json['message'] ) ? (string) $json['message'] : '',
		);
	}

	/**
	 * Ask SaaS to create Cloudflare Custom Hostname (auto — no owner dashboard click).
	 *
	 * @return array{ ok?: bool, skipped?: bool, created?: bool, message?: string }
	 */
	public static function ensure_collect_hostname_via_api( string $hostname ): array {
		$hostname = self::normalize_hostname( $hostname );
		if ( $hostname === '' ) {
			return array( 'ok' => false, 'message' => 'missing hostname' );
		}
		$stored = get_option( 'ecomso_settings', array() );
		$stored = is_array( $stored ) ? $stored : array();
		if ( class_exists( 'ECOMSO_Config' ) ) {
			$stored = ECOMSO_Config::merge_settings( $stored );
		}
		$mid = isset( $stored['merchant_id'] ) ? trim( (string) $stored['merchant_id'] ) : '';
		$api = isset( $stored['api_base'] ) ? (string) $stored['api_base'] : '';
		if ( $mid === '' || $api === '' || ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return array( 'skipped' => true, 'message' => 'missing api/merchant' );
		}
		$url = ECOMSO_Enqueue::ingest_url_with_key( '/v1/tracking/ensure-collect-hostname', $api, $mid );
		if ( $url === '' ) {
			return array( 'skipped' => true, 'message' => 'bad api url' );
		}
		$res = wp_remote_post(
			$url,
			array(
				'timeout' => 45,
				'headers' => array(
					'Content-Type'   => 'application/json',
					'Accept'         => 'application/json',
					'x-merchant-key' => $mid,
				),
				'body'    => wp_json_encode(
					array(
						'hostname' => $hostname,
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return array(
				'ok'      => false,
				'message' => $res->get_error_message(),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		$json = json_decode( $body, true );
		$data = is_array( $json ) && isset( $json['data'] ) && is_array( $json['data'] ) ? $json['data'] : ( is_array( $json ) ? $json : array() );
		$ok   = $code >= 200 && $code < 300 && ! empty( $json['ok'] );
		return array(
			'ok'      => $ok,
			'created' => ! empty( $data['provision']['created'] ) || ! empty( $data['created'] ),
			'message' => isset( $data['message'] ) ? (string) $data['message'] : ( isset( $json['message'] ) ? (string) $json['message'] : '' ),
		);
	}

	/**
	 * @return array{ ok: bool, message?: string }
	 */
	public static function probe_tracking_https_with_retries( string $hostname, int $attempts = 4, int $sleep_seconds = 2 ): array {
		$last = array( 'ok' => false, 'message' => '' );
		$attempts = max( 1, $attempts );
		for ( $i = 0; $i < $attempts; $i++ ) {
			$last = self::probe_tracking_https( $hostname );
			if ( ! empty( $last['ok'] ) ) {
				return $last;
			}
			if ( $i < $attempts - 1 && $sleep_seconds > 0 ) {
				sleep( $sleep_seconds );
			}
		}
		return $last;
	}

	/**
	 * Confirm the tracking hostname answers HTTPS (CNAME alone is not enough — broken collect edge
	 * would switch the storefront off store_proxy onto a dead subdomain).
	 *
	 * @return array{ ok: bool, message?: string }
	 */
	public static function probe_tracking_https( string $hostname ): array {
		$hostname = self::normalize_hostname( $hostname );
		if ( $hostname === '' ) {
			return array( 'ok' => false, 'message' => __( 'Missing tracking hostname.', 'ecomsolvebd' ) );
		}
		$url = 'https://' . $hostname . '/api/v1/health';
		$res = wp_remote_get(
			$url,
			array(
				'timeout'     => 10,
				'redirection' => 2,
				'sslverify'   => true,
				'headers'     => array(
					'Accept' => 'application/json',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return array(
				'ok'      => false,
				'message' => sprintf(
					/* translators: 1: hostname, 2: error */
					__( 'DNS CNAME for %1$s is OK, but HTTPS failed (%2$s). Fix collect.ecomsolvebd.com / SSL for custom hostnames before subdomain tracking can activate.', 'ecomsolvebd' ),
					$hostname,
					$res->get_error_message()
				),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( $code >= 200 && $code < 400 ) {
			return array( 'ok' => true );
		}
		return array(
			'ok'      => false,
			'message' => sprintf(
				/* translators: 1: hostname, 2: HTTP status */
				__( 'DNS CNAME for %1$s is OK, but https://%1$s/api/v1/health returned HTTP %2$d. Subdomain tracking is not activated yet.', 'ecomsolvebd' ),
				$hostname,
				$code
			),
		);
	}

	/**
	 * Server-side proxy POST to SaaS (avoids browser CORS / third-party blocking).
	 *
	 * @param bool $blocking When false, fire-and-forget (short timeout, response never read) —
	 *   used by ECOMSO_Server_Precapture so an attribution-only landing hit cannot add latency to a
	 *   real page render. Default true preserves existing REST-proxy behavior exactly.
	 * @return array{ ok: bool, code: int, body: string }
	 */
	public static function proxy_post( string $upstream_path, string $body, string $api_base, string $merchant_id, ?string $client_user_agent = null, array $forward_headers = array(), bool $blocking = true ): array {
		$url = ECOMSO_Enqueue::ingest_url_with_key( $upstream_path, $api_base, $merchant_id );
		if ( $url === '' ) {
			return array( 'ok' => false, 'code' => 400, 'body' => '{"error":"missing_config"}' );
		}

		$headers = array(
			'Content-Type' => 'application/json',
			'Accept'       => 'application/json',
		);
		if ( $merchant_id !== '' ) {
			$headers['x-merchant-key'] = $merchant_id;
		}
		if ( is_string( $client_user_agent ) ) {
			$forward_ua = trim( $client_user_agent );
			if ( $forward_ua !== '' ) {
				$headers['X-Client-User-Agent'] = $forward_ua;
			}
		}
		if ( ! empty( $forward_headers ) ) {
			$forward_headers = class_exists( 'ECOMSO_Http' )
				? ECOMSO_Http::whitelist_forward_headers( $forward_headers )
				: array();
			foreach ( $forward_headers as $name => $value ) {
				if ( ! is_string( $name ) || ! is_string( $value ) ) {
					continue;
				}
				$clean_name  = trim( $name );
				$clean_value = trim( $value );
				if ( $clean_name === '' || $clean_value === '' ) {
					continue;
				}
				$lower = strtolower( $clean_name );
				if ( 'x-esb-client-ip' === $lower && empty( $headers['X-ESB-Client-IP'] ) ) {
					$headers['X-ESB-Client-IP'] = $clean_value;
					if ( empty( $headers['X-Real-IP'] ) ) {
						$headers['X-Real-IP'] = $clean_value;
					}
				} elseif ( 'x-real-ip' === $lower && empty( $headers['X-Real-IP'] ) ) {
					$headers['X-Real-IP'] = $clean_value;
				} elseif ( 'x-esb-client-country' === $lower && empty( $headers['X-ESB-Client-Country'] ) ) {
					$headers['X-ESB-Client-Country'] = $clean_value;
				} elseif ( 'x-country-code' === $lower && empty( $headers['X-Country-Code'] ) ) {
					$headers['X-Country-Code'] = $clean_value;
				} elseif ( 'x-forwarded-for' === $lower && empty( $headers['X-Forwarded-For'] ) ) {
					$headers['X-Forwarded-For'] = $clean_value;
				}
			}
			// Prefer visitor IP at the left of XFF when we recovered it from the connection.
			if ( ! empty( $headers['X-ESB-Client-IP'] ) ) {
				$vip = (string) $headers['X-ESB-Client-IP'];
				$xff = '';
				if ( ! empty( $headers['X-Forwarded-For'] ) && is_string( $headers['X-Forwarded-For'] ) ) {
					$xff = trim( $headers['X-Forwarded-For'] );
				}
				if ( $xff === '' ) {
					$headers['X-Forwarded-For'] = $vip;
				} elseif ( stripos( $xff, $vip ) !== 0 ) {
					$headers['X-Forwarded-For'] = $vip . ', ' . $xff;
				}
			}
		}

		$args = array(
			// blocking=false still opens + writes the request synchronously (small, bounded cost)
			// but returns immediately without waiting for/reading the response — WP's standard
			// fire-and-forget pattern (used by WP core for pingbacks, cron-spawn, etc).
			'timeout'  => $blocking ? 30 : 3,
			'blocking' => $blocking,
			'method'   => 'POST',
			'headers'  => $headers,
			'body'     => $body,
		);
		if ( class_exists( 'ECOMSO_Http' ) ) {
			$args = ECOMSO_Http::remote_args( $args, $url );
		}

		$res = wp_remote_post( $url, $args );
		if ( ! $blocking ) {
			// Nothing meaningful to report — caller does not use the return value.
			return array( 'ok' => true, 'code' => 0, 'body' => '' );
		}
		if ( is_wp_error( $res ) ) {
			return array(
				'ok'   => false,
				'code' => 502,
				'body' => wp_json_encode(
					array(
						'error' => array(
							'code'    => 'BAD_GATEWAY',
							'message' => $res->get_error_message(),
						),
					)
				),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $res );
		$text = (string) wp_remote_retrieve_body( $res );
		return array(
			'ok'   => $code >= 200 && $code < 300,
			'code' => $code,
			'body' => $text,
		);
	}

	/**
	 * @return array{ ok: bool, code: int, body: string }
	 */
	public static function proxy_get( string $upstream_path, string $api_base, string $merchant_id ): array {
		$url = ECOMSO_Enqueue::ingest_url_with_key( $upstream_path, $api_base, $merchant_id );
		if ( $url === '' ) {
			return array( 'ok' => false, 'code' => 400, 'body' => '{"error":"missing_config"}' );
		}

		$args = array(
			'timeout' => 25,
			'headers' => array( 'Accept' => 'application/json' ),
		);
		if ( $merchant_id !== '' ) {
			$args['headers']['x-merchant-key'] = $merchant_id;
		}
		if ( class_exists( 'ECOMSO_Http' ) ) {
			$res = ECOMSO_Http::remote_get( $url, ECOMSO_Http::remote_args( $args, $url ) );
			return array(
				'ok'   => $res['ok'],
				'code' => $res['code'],
				'body' => $res['body'],
			);
		}

		$res = wp_remote_get( $url, $args );
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'code' => 502, 'body' => '{}' );
		}
		return array(
			'ok'   => (int) wp_remote_retrieve_response_code( $res ) >= 200,
			'code' => (int) wp_remote_retrieve_response_code( $res ),
			'body' => (string) wp_remote_retrieve_body( $res ),
		);
	}

	/** Cache-safe tracker-config REST URL (bypasses stale CDN/page-cache of JSON). */
	private static function host_ends_with( string $host, string $suffix ): bool {
		$needle = '.' . strtolower( rtrim( $suffix, '.' ) );
		return strlen( $host ) > strlen( $needle ) && substr( $host, -strlen( $needle ) ) === $needle;
	}

	public static function tracker_config_rest_url(): string {
		$rev = class_exists( 'ECOMSO_Cache' ) ? (string) ECOMSO_Cache::settings_revision() : '1';
		return add_query_arg(
			array(
				'_rev' => $rev,
				'_v'   => defined( 'ECOMSO_VERSION' ) ? ECOMSO_VERSION : '1',
			),
			rest_url( 'ecomso/v1/tracker-config' )
		);
	}
}
