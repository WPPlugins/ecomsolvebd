<?php
/**
 * Plugin Name:       EcomSolveBD
 * Plugin URI:        https://ecomsolvebd.com
 * Description:       First-party analytics and attribution for EcomSolveBD — UTM, click IDs, sessions, WooCommerce events.
 * Version:           1.0.67
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            EcomSolveBD
 * Author URI:        https://profiles.wordpress.org/ecomsolvebd/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       ecomsolvebd
 * Domain Path:       /languages
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

define( 'ECOMSO_VERSION', '1.0.67' );

/** Kept for BC with older snippets; storefront console debug is always off. */
if ( ! defined( 'ECOMSO_WC_TEST' ) ) {
	define( 'ECOMSO_WC_TEST', false );
}
define( 'ECOMSO_FILE', __FILE__ );
define( 'ECOMSO_DIR', plugin_dir_path( __FILE__ ) );
define( 'ECOMSO_URL', plugin_dir_url( __FILE__ ) );
define( 'ECOMSO_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Load dependencies in a fixed order (required during activation and runtime).
 */
function ecomso_load_plugin_files(): void {
	static $loaded = false;
	if ( $loaded ) {
		return;
	}
	$loaded = true;

	$files = array(
		'includes/class-ecomso-migrate.php',
		'includes/class-ecomso-config.php',
		'includes/class-ecomso-first-party.php',
		'includes/class-ecomso-http.php',
		'includes/class-ecomso-cache.php',
		'includes/class-ecomso-cache-compat.php',
		'includes/class-ecomso-version.php',
		'includes/class-ecomso-rest.php',
		'includes/class-ecomso-enqueue.php',
		'includes/class-ecomso-feed.php',
		'includes/class-ecomso-catalog-sync.php',
		'includes/class-ecomso-admin.php',
		'includes/class-ecomso-ga4.php',
		'includes/class-ecomso-install.php',
		'includes/class-ecomso-pipeline-sync.php',
		'includes/class-ecomso-wc.php',
		'includes/class-ecomso-server-precapture.php',
		'includes/class-ecomsolvebd.php',
	);

	foreach ( $files as $rel ) {
		$path = ECOMSO_DIR . $rel;
		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
}

ecomso_load_plugin_files();

if ( class_exists( 'ECOMSO_Migrate' ) ) {
	ECOMSO_Migrate::init();
}

register_activation_hook( ECOMSO_FILE, array( 'ECOMSO_Install', 'activate' ) );
register_deactivation_hook( ECOMSO_FILE, array( 'ECOMSO_Install', 'deactivate' ) );

if ( class_exists( 'ECOMSO_Version' ) ) {
	ECOMSO_Version::init();
}

if ( class_exists( 'ECOMSO_Cache_Compat' ) ) {
	ECOMSO_Cache_Compat::init();
}

if ( class_exists( 'ECOMSO_Pipeline_Sync' ) ) {
	ECOMSO_Pipeline_Sync::init();
}

if ( class_exists( 'EcomSolveBD_Tracker' ) ) {
	EcomSolveBD_Tracker::instance();
}
