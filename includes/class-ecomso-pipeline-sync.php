<?php
/**
 * Keep SaaS plugin connection status in sync without re-saving settings.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Pipeline_Sync {

	private const TRANSIENT_KEY = 'ecomso_pipeline_sync_at';
	private const INTERVAL_SEC  = 90;
	private const LAST_KEY_OPT  = 'ecomso_saas_pipeline_merchant_key';
	private const LAST_BASE_OPT = 'ecomso_saas_pipeline_api_base';

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'maybe_sync_on_init' ), 25 );
	}

	/**
	 * Run immediately (activation, manual).
	 */
	public static function sync_now(): void {
		self::run_sync( true );
	}

	/**
	 * Throttled background sync while the plugin is active.
	 */
	public static function maybe_sync_on_init(): void {
		$last = (int) get_transient( self::TRANSIENT_KEY );
		if ( $last > 0 && ( time() - $last ) < self::INTERVAL_SEC ) {
			return;
		}
		set_transient( self::TRANSIENT_KEY, (string) time(), self::INTERVAL_SEC );
		self::run_sync( false );
	}

	/**
	 * @return array{api_base:string,merchant_id:string}|null
	 */
	private static function read_credentials(): ?array {
		if ( ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return null;
		}
		$stored = get_option( 'ecomso_settings', array() );
		if ( ! is_array( $stored ) ) {
			return null;
		}
		$merged = class_exists( 'ECOMSO_Config' )
			? ECOMSO_Config::merge_settings( $stored )
			: $stored;
		$api_base    = isset( $merged['api_base'] ) ? ECOMSO_Enqueue::normalize_api_base( (string) $merged['api_base'] ) : '';
		$merchant_id = isset( $merged['merchant_id'] ) ? trim( (string) $merged['merchant_id'] ) : '';
		if ( $api_base === '' || $merchant_id === '' ) {
			return null;
		}
		return array(
			'api_base'    => $api_base,
			'merchant_id' => $merchant_id,
		);
	}

	/**
	 * @param bool $force Skip throttling when true.
	 */
	private static function run_sync( bool $force ): void {
		unset( $force );
		if ( ! class_exists( 'ECOMSO_Admin' ) ) {
			return;
		}

		$creds = self::read_credentials();
		if ( null === $creds ) {
			// Missing merchant id only — do not disconnect when api_base is empty in DB (defaults apply at runtime).
			$stored = get_option( 'ecomso_settings', array() );
			$mid    = is_array( $stored ) ? trim( (string) ( $stored['merchant_id'] ?? '' ) ) : '';
			if ( $mid === '' ) {
				self::notify_disconnect_from_last_known();
			}
			return;
		}

		$result = ECOMSO_Admin::validate_merchant_id_result( $creds['api_base'], $creds['merchant_id'] );
		ECOMSO_Admin::record_connection_check( $result );
		if ( ! empty( $result['ok'] ) ) {
			update_option( self::LAST_KEY_OPT, $creds['merchant_id'], false );
			update_option( self::LAST_BASE_OPT, $creds['api_base'], false );
			return;
		}

		// Invalid key — tell SaaS plugin is offline (wrong credentials).
		if ( 'bad_key' === ( $result['reason'] ?? '' ) ) {
			ECOMSO_Admin::notify_saas_plugin_disconnect( $creds['api_base'], $creds['merchant_id'] );
			delete_option( self::LAST_KEY_OPT );
			delete_option( self::LAST_BASE_OPT );
		}
	}

	private static function notify_disconnect_from_last_known(): void {
		$last_key  = get_option( self::LAST_KEY_OPT, '' );
		$last_base = get_option( self::LAST_BASE_OPT, '' );
		if ( ! is_string( $last_key ) || ! is_string( $last_base ) || $last_key === '' || $last_base === '' ) {
			return;
		}
		ECOMSO_Admin::notify_saas_plugin_disconnect( $last_base, $last_key );
		delete_option( self::LAST_KEY_OPT );
		delete_option( self::LAST_BASE_OPT );
	}

	/**
	 * Called on plugin deactivation / uninstall with current stored settings.
	 */
	public static function notify_disconnect_with_stored_credentials(): void {
		$creds = self::read_credentials();
		if ( null !== $creds ) {
			ECOMSO_Admin::notify_saas_plugin_disconnect( $creds['api_base'], $creds['merchant_id'] );
		} else {
			self::notify_disconnect_from_last_known();
		}
		delete_option( self::LAST_KEY_OPT );
		delete_option( self::LAST_BASE_OPT );
	}
}
