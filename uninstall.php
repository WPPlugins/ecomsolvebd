<?php
/**
 * Uninstall cleanup.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

$ecomso_root = dirname( __FILE__ );
if ( is_readable( $ecomso_root . '/includes/class-ecomso-http.php' ) ) {
	require_once $ecomso_root . '/includes/class-ecomso-http.php';
}
if ( is_readable( $ecomso_root . '/includes/class-ecomso-enqueue.php' ) ) {
	require_once $ecomso_root . '/includes/class-ecomso-enqueue.php';
}
if ( is_readable( $ecomso_root . '/includes/class-ecomso-admin.php' ) ) {
	require_once $ecomso_root . '/includes/class-ecomso-admin.php';
}
if ( is_readable( $ecomso_root . '/includes/class-ecomso-pipeline-sync.php' ) ) {
	require_once $ecomso_root . '/includes/class-ecomso-pipeline-sync.php';
	if ( class_exists( 'ECOMSO_Pipeline_Sync' ) ) {
		ECOMSO_Pipeline_Sync::notify_disconnect_with_stored_credentials();
	}
}

delete_option( 'ecomso_settings' );
delete_option( 'ecomso_ga4_settings' );
delete_option( 'ecomso_saas_pipeline_merchant_key' );
delete_option( 'ecomso_saas_pipeline_api_base' );
delete_option( 'ecomso_version' );
delete_option( 'ecomso_last_connection' );
delete_option( 'ecomso_settings_rev' );
delete_option( 'ecomso_cache_notice_dismissed' );
delete_option( 'ecomso_migrated_from_fct' );
delete_option( 'ecomso_migrated_from_esb' );

flush_rewrite_rules( false );
