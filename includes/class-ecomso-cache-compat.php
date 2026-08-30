<?php
/**
 * Keep tracking working when WP Fastest Cache, WP Rocket, LiteSpeed, W3TC, Pantheon, etc. are active.
 * Does not disable full-page cache — uses live REST config + cache-safe boot script.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Cache_Compat {

	public static function init(): void {
		// WP Rocket.
		add_filter( 'rocket_exclude_js', array( __CLASS__, 'exclude_js_from_optimization' ) );
		add_filter( 'rocket_exclude_defer_js', array( __CLASS__, 'exclude_js_from_optimization' ) );
		add_filter( 'rocket_delay_js_exclusions', array( __CLASS__, 'exclude_js_from_optimization' ) );

		// LiteSpeed Cache.
		add_filter( 'litespeed_optimize_js_excludes', array( __CLASS__, 'exclude_js_from_optimization' ) );
		add_filter( 'litespeed_optm_js_defer_exc', array( __CLASS__, 'exclude_js_from_optimization' ) );

		// Autoptimize.
		add_filter( 'autoptimize_filter_js_exclude', array( __CLASS__, 'autoptimize_js_exclude' ), 10, 2 );

		// W3 Total Cache — do not minify our handles.
		add_filter( 'w3tc_minify_js_script_tags', array( __CLASS__, 'w3tc_skip_minify' ), 10, 2 );

		// WP Fastest Cache — never combine/minify our files; REST stays dynamic.
		add_filter( 'wpfc_exclude_current_page', array( __CLASS__, 'wpfc_exclude_rest_only' ), 10, 1 );

		// Pantheon / generic: bust when plugin updates.
		add_action( 'upgrader_process_complete', array( __CLASS__, 'on_plugin_upgraded' ), 10, 2 );
	}

	/** @param string[]|mixed $list */
	public static function exclude_js_from_optimization( $list ): array {
		if ( ! is_array( $list ) ) {
			$list = array();
		}
		$patterns = array(
			'ecomso-runtime',
			'f-commerce-tracker',
			'ecomso-wc-bridge',
			'ecomso-cache-safe-boot',
			'ecomsolvebd',
		);
		foreach ( $patterns as $p ) {
			if ( ! in_array( $p, $list, true ) ) {
				$list[] = $p;
			}
		}
		return $list;
	}

	/** @param string $exclude */
	public static function autoptimize_js_exclude( $exclude, $content ): string {
		unset( $content );
		$extra = 'ecomso-runtime.js, ecomsolvebd.js, ecomso-wc-bridge.js, ecomso-cache-safe-boot';
		if ( $exclude === '' ) {
			return $extra;
		}
		return $exclude . ', ' . $extra;
	}

	/**
	 * @param string[]|mixed $tags
	 * @return string[]|mixed
	 */
	public static function w3tc_skip_minify( $tags, $js_array ) {
		unset( $js_array );
		if ( ! is_array( $tags ) ) {
			return $tags;
		}
		foreach ( $tags as $i => $tag ) {
			if ( is_string( $tag ) && ( strpos( $tag, 'f-commerce-tracker' ) !== false || strpos( $tag, 'ecomso-' ) !== false ) ) {
				unset( $tags[ $i ] );
			}
		}
		return $tags;
	}

	/** Only exclude REST from WPFC page cache (not the whole storefront). */
	/** @param bool|int $exclude */
	public static function wpfc_exclude_rest_only( $exclude ) {
		if ( $exclude ) {
			return $exclude;
		}
		$uri = isset( $_SERVER['REQUEST_URI'] )
			? sanitize_text_field( wp_unslash( (string) $_SERVER['REQUEST_URI'] ) )
			: '';
		if ( strpos( $uri, '/wp-json/ecomso/' ) !== false || strpos( $uri, '/wp-json/esb/' ) !== false || strpos( $uri, '/wp-json/fct/' ) !== false ) {
			return true;
		}
		return $exclude;
	}

	/**
	 * @param WP_Upgrader $upgrader
	 * @param array       $options
	 */
	public static function on_plugin_upgraded( $upgrader, $options ): void {
		unset( $upgrader );
		if ( ! is_array( $options ) || ( $options['type'] ?? '' ) !== 'plugin' ) {
			return;
		}
		$plugins = $options['plugins'] ?? array();
		if ( ! is_array( $plugins ) ) {
			return;
		}
		foreach ( $plugins as $plugin ) {
			if ( is_string( $plugin ) && strpos( $plugin, 'ecomsolvebd' ) !== false ) {
				if ( class_exists( 'ECOMSO_Cache' ) ) {
					ECOMSO_Cache::bust_storefront();
				}
				if ( function_exists( 'wpfc_clear_all_cache' ) ) {
					wpfc_clear_all_cache( true );
				}
				break;
			}
		}
	}
}
