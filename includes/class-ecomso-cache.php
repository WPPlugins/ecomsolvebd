<?php
/**
 * Bust Pantheon / page cache when tracker credentials change.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Cache {

	private const REV_OPT = 'ecomso_settings_rev';

	public static function settings_revision(): int {
		return max( 1, (int) get_option( self::REV_OPT, 1 ) );
	}

	/**
	 * Call after Merchant ID or API base changes so the storefront cannot keep an old inline config.
	 */
	public static function bust_storefront(): void {
		update_option( self::REV_OPT, self::settings_revision() + 1, false );

		if ( function_exists( 'wp_cache_flush' ) ) {
			wp_cache_flush();
		}

		self::clear_pantheon_edge_cache();

		// WP Rocket, W3TC, LiteSpeed — best-effort.
		if ( function_exists( 'rocket_clean_domain' ) ) {
			rocket_clean_domain();
		}
		if ( function_exists( 'w3tc_flush_all' ) ) {
			w3tc_flush_all();
		}
		if ( class_exists( 'LiteSpeed_Cache_API' ) && method_exists( 'LiteSpeed_Cache_API', 'purge_all' ) ) {
			LiteSpeed_Cache_API::purge_all();
		}
	}

	/** Pantheon MU plugin — only call documented helpers with correct arity. */
	private static function clear_pantheon_edge_cache(): void {
		if ( function_exists( 'pantheon_wp_clear_edge_all' ) ) {
			pantheon_wp_clear_edge_all();
			return;
		}
		if ( function_exists( 'pantheon_wp_clear_edge_paths' ) ) {
			$paths = array( '/', '/shop/', '/cart/', '/checkout/', '/product/', '/wp-json/ecomso/v1/tracker-config' );
			if ( function_exists( 'home_url' ) ) {
				$home = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
				if ( is_string( $home ) && $home !== '' && $home !== '/' ) {
					$paths[] = trailingslashit( $home );
				}
			}
			pantheon_wp_clear_edge_paths( $paths );
		}
		// Do not call pantheon_clear_edge() or pantheon_wp_clear_edge_keys() without required args.
	}

	/** Script handle version — changes when credentials change (breaks browser/CDN cache). */
	public static function asset_version( string $merchant_id, string $api_base ): string {
		$fp = substr( hash( 'sha256', $merchant_id . '|' . $api_base ), 0, 10 );
		return ECOMSO_VERSION . '.' . self::settings_revision() . '.' . $fp;
	}
}
