<?php
/**
 * Front-end scripts — cache-safe boot via live REST config (works with any page-cache plugin).
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Enqueue {

	/**
	 * Cache-bust script URLs by file modification time (not static ECOMSO_VERSION).
	 *
	 * @param string $relative_path Path under plugin root, e.g. assets/js/ecomso-runtime.js.
	 */
	public static function asset_file_version( string $relative_path ): string {
		$path = plugin_dir_path( dirname( __FILE__ ) ) . ltrim( $relative_path, '/' );
		if ( is_readable( $path ) ) {
			$mtime = filemtime( $path );
			if ( false !== $mtime ) {
				return (string) $mtime;
			}
		}
		return ECOMSO_VERSION;
	}

	public static function init(): void {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 1 );
		add_action( 'wp_footer', array( __CLASS__, 'footer_config_marker' ), 99 );
		add_filter( 'script_loader_tag', array( __CLASS__, 'force_sync_tracker_scripts' ), 10, 2 );
	}

	/**
	 * @param string $tag
	 * @param string $handle
	 * @return string
	 */
	public static function force_sync_tracker_scripts( $tag, $handle ) {
		if ( 'ecomso-runtime' !== $handle ) {
			return $tag;
		}
		return str_replace( array( ' defer', ' async' ), '', $tag );
	}

	/** HTML comment — quick check that PHP ran (not only stale cache). */
	public static function footer_config_marker(): void {
		if ( is_admin() || ! class_exists( 'ECOMSO_Admin' ) || ! ECOMSO_Admin::is_storefront_tracking_enabled() ) {
			return;
		}
		$s   = self::settings();
		$mid = isset( $s['merchant_id'] ) ? sanitize_text_field( (string) $s['merchant_id'] ) : '';
		if ( $mid === '' ) {
			return;
		}
		$rev = class_exists( 'ECOMSO_Cache' ) ? (string) ECOMSO_Cache::settings_revision() : '1';
		echo "\n<!-- ESB tracker v" . esc_attr( ECOMSO_VERSION ) . ' key=' . esc_attr( substr( $mid, 0, 8 ) ) . '… rev=' . esc_attr( $rev ) . " -->\n";
	}

	/** @return array<string,mixed> */
	private static function settings(): array {
		$stored = get_option( 'ecomso_settings', array() );
		if ( class_exists( 'ECOMSO_Config' ) ) {
			return ECOMSO_Config::merge_settings( is_array( $stored ) ? $stored : array() );
		}
		return is_array( $stored ) ? $stored : array();
	}

	/**
	 * EcomSolveBD Express mounts routes under `/api`.
	 * Accepts tunnel root (`https://host`) or full base (`https://host/api`).
	 */
	public static function normalize_api_base( string $raw ): string {
		$t = trim( $raw );
		if ( $t === '' ) {
			return '';
		}
		$u = esc_url_raw( rtrim( $t, '/' ) );
		if ( $u === '' ) {
			return '';
		}
		$p = wp_parse_url( $u );
		if ( ! is_array( $p ) || empty( $p['host'] ) ) {
			return $u;
		}
		$scheme = isset( $p['scheme'] ) ? strtolower( (string) $p['scheme'] ) : 'https';
		$host   = strtolower( (string) $p['host'] );
		$port   = isset( $p['port'] ) ? ':' . (int) $p['port'] : '';
		$path   = isset( $p['path'] ) ? rtrim( (string) $p['path'], '/' ) : '';

		if ( $path === '' || $path === '/' ) {
			return "{$scheme}://{$host}{$port}/api";
		}
		if ( preg_match( '#/api$#i', $path ) ) {
			return "{$scheme}://{$host}{$port}{$path}";
		}
		return "{$scheme}://{$host}{$port}/api";
	}

	public static function collect_endpoint( array $s ): string {
		$base = isset( $s['api_base'] ) ? self::normalize_api_base( (string) $s['api_base'] ) : '';
		if ( $base === '' ) {
			return '';
		}
		if ( ! empty( $s['use_master_ingest'] ) ) {
			return $base . '/v1/events/master-ingest';
		}
		return $base . '/v1/tracking/collect';
	}

	/** Single `?key=` on ingest URL (duplicate query keys break server auth). */
	public static function ingest_url_with_key( string $path, string $api_base, string $merchant_id ): string {
		$base = self::normalize_api_base( $api_base );
		if ( $base === '' || $merchant_id === '' ) {
			return '';
		}
		return $base . $path . '?key=' . rawurlencode( $merchant_id );
	}

	/**
	 * Enqueue runtime via WP APIs (Plugin Check). Inline boot config still lands in page HTML
	 * so full-page caches keep working; runtime then fetches live tracker-config over REST.
	 */
	public static function enqueue(): void {
		if ( is_admin() || ! class_exists( 'ECOMSO_Admin' ) || ! ECOMSO_Admin::is_storefront_tracking_enabled() ) {
			return;
		}

		$config_url = class_exists( 'ECOMSO_First_Party' )
			? ECOMSO_First_Party::tracker_config_rest_url()
			: rest_url( 'ecomso/v1/tracker-config' );
		$wc_bridge  = class_exists( 'WooCommerce' ) && self::should_load_wc_bridge();

		$boot = array(
			'wcBridge'   => $wc_bridge,
			'configUrl'  => $config_url,
			'wcDataBase' => rest_url( 'ecomso/v1/' ),
		);
		if ( function_exists( 'is_product' ) && is_product() ) {
			$qid = (int) get_queried_object_id();
			if ( $qid > 0 ) {
				$boot['productId'] = $qid;
			}
		}

		$src = trailingslashit( ECOMSO_URL ) . 'assets/js/ecomso-runtime.js';
		$ver = self::asset_file_version( 'assets/js/ecomso-runtime.js' );
		wp_register_script( 'ecomso-runtime', $src, array(), $ver, true );
		wp_enqueue_script( 'ecomso-runtime' );
		wp_add_inline_script(
			'ecomso-runtime',
			'window.__ECOMSO_RUNTIME__=' . wp_json_encode( $boot ) . ';',
			'before'
		);
	}

	public static function should_load_wc_bridge(): bool {
		if ( function_exists( 'is_cart' ) && is_cart() ) {
			return true;
		}
		if ( class_exists( 'ECOMSO_WC' ) && ECOMSO_WC::is_checkout_context() ) {
			return true;
		}
		if ( function_exists( 'is_checkout' ) && is_checkout() ) {
			return true;
		}
		if ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) {
			return true;
		}
		if ( function_exists( 'is_product' ) && is_product() ) {
			return true;
		}
		if ( function_exists( 'is_shop' ) && ( is_shop() || is_product_category() || is_product_tag() ) ) {
			return true;
		}
		return false;
	}
}
