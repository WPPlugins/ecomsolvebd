<?php
/**
 * Auto-bust Pantheon / page cache when the plugin version changes.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Version {

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_upgrade' ), 5 );
	}

	public static function maybe_upgrade(): void {
		$prev = get_option( 'ecomso_version', '' );
		if ( ! is_string( $prev ) ) {
			$prev = '';
		}
		if ( $prev === ECOMSO_VERSION ) {
			return;
		}
		if ( class_exists( 'ECOMSO_Feed' ) ) {
			// `plugins_loaded` runs before WordPress creates $wp_rewrite — adding rules here is a fatal error
			// ("add_rule() on null"). Register + flush on `init` instead, after the feed rules are added.
			add_action(
				'init',
				static function () {
					ECOMSO_Feed::register_rewrite();
					flush_rewrite_rules( false );
				},
				99
			);
		}
		if ( class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}
		update_option( 'ecomso_version', ECOMSO_VERSION, false );
	}
}
