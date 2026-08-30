<?php
/**
 * Shared defaults for live vs local API.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Config {

	/** Production EcomSolveBD API (plugin appends /api when missing). */
	public const LIVE_API_ORIGIN = 'https://api.ecomsolvebd.com';

	/** CNAME target for optional tracking subdomain (first-party edge). */
	public const FIRST_PARTY_CNAME_TARGET = 'collect.ecomsolvebd.com';

	public static function default_api_base(): string {
		return self::LIVE_API_ORIGIN;
	}

	/** @return array<string,mixed> */
	public static function settings_defaults(): array {
		return array(
			'api_base'                   => self::default_api_base(),
			'merchant_id'                => '',
			'site_key'                   => '',
			'batch_flush_ms'             => 5000,
			'use_master_ingest'          => true,
			'first_party_mode'           => 'auto',
			'tracking_subdomain_label'   => 'example',
			'tracking_hostname'          => '',
			'tracking_hostname_verified' => false,
			/** Server-side (PHP, `template_redirect`) landing capture — before any browser JS runs. */
			'server_precapture_enabled'  => true,
		);
	}

	/**
	 * Merge stored options with defaults; fill empty api_base so UI + proxy always have a live API.
	 *
	 * @param array<string,mixed> $stored
	 * @return array<string,mixed>
	 */
	public static function merge_settings( array $stored ): array {
		$defaults = self::settings_defaults();
		$merged   = wp_parse_args( $stored, $defaults );
		if ( trim( (string) ( $merged['api_base'] ?? '' ) ) === '' ) {
			$merged['api_base'] = $defaults['api_base'];
		}
		return $merged;
	}

	/** Settings input shows API origin only (no trailing /api). */
	public static function api_base_settings_field_value( string $stored ): string {
		$t = trim( $stored );
		if ( $t === '' ) {
			return self::default_api_base();
		}
		if ( preg_match( '#/api$#i', $t ) ) {
			return (string) preg_replace( '#/api$#i', '', rtrim( $t, '/' ) );
		}
		return rtrim( $t, '/' );
	}

	public static function is_live_api_base( string $api_base ): bool {
		$base = strtolower( rtrim( trim( $api_base ), '/' ) );
		if ( $base === '' ) {
			return false;
		}
		return false !== strpos( $base, 'api.ecomsolvebd.com' );
	}

	public static function is_local_api_base( string $api_base ): bool {
		$base = strtolower( rtrim( trim( $api_base ), '/' ) );
		if ( $base === '' ) {
			return false;
		}
		return false !== strpos( $base, 'ngrok' )
			|| false !== strpos( $base, 'localhost' )
			|| false !== strpos( $base, '127.0.0.1' );
	}
}
