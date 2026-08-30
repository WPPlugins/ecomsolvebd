<?php
/**
 * Activation / deactivation (no side effects on plain load).
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Install {

	public static function activate(): void {
		$defaults = class_exists( 'ECOMSO_Config' )
			? ECOMSO_Config::settings_defaults()
			: array(
				'api_base'                   => 'https://api.ecomsolvebd.com',
				'merchant_id'                => '',
				'site_key'                   => '',
				'batch_flush_ms'             => 5000,
				'use_master_ingest'          => true,
				'first_party_mode'           => 'auto',
				'tracking_subdomain_label'   => 'example',
				'tracking_hostname'          => '',
				'tracking_hostname_verified' => false,
			);
		$stored = get_option( 'ecomso_settings', array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$merged = class_exists( 'ECOMSO_Config' )
			? ECOMSO_Config::merge_settings( $stored )
			: wp_parse_args( $stored, $defaults );
		update_option( 'ecomso_settings', $merged, false );

		if ( ! class_exists( 'ECOMSO_Feed' ) ) {
			require_once ECOMSO_DIR . 'includes/class-ecomso-feed.php';
		}
		ECOMSO_Feed::register_rewrite();
		flush_rewrite_rules( false );
		update_option( 'ecomso_version', ECOMSO_VERSION, false );

		if ( class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}
		if ( function_exists( 'wpfc_clear_all_cache' ) ) {
			wpfc_clear_all_cache( true );
		}
		if ( class_exists( 'ECOMSO_Pipeline_Sync' ) ) {
			ECOMSO_Pipeline_Sync::sync_now();
		}
	}

	public static function deactivate(): void {
		if ( class_exists( 'ECOMSO_Pipeline_Sync' ) ) {
			ECOMSO_Pipeline_Sync::notify_disconnect_with_stored_credentials();
		}
		flush_rewrite_rules( false );
	}
}
