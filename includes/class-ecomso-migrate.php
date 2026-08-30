<?php
/**
 * Migrate options and meta from legacy fcommerce-tracker / fct_* / esb_* names.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Migrate {

	private const OPTION_MAP = array(
		'fct_settings'                   => 'ecomso_settings',
		'fct_ga4_settings'               => 'ecomso_ga4_settings',
		'fct_last_connection'            => 'ecomso_last_connection',
		'fct_settings_rev'               => 'ecomso_settings_rev',
		'fct_version'                    => 'ecomso_version',
		'fct_cache_notice_dismissed'     => 'ecomso_cache_notice_dismissed',
		'fct_saas_pipeline_merchant_key' => 'ecomso_saas_pipeline_merchant_key',
		'fct_saas_pipeline_api_base'     => 'ecomso_saas_pipeline_api_base',
	);

	private const LEGACY_ESB_OPTION_MAP = array(
		'esb_settings'                   => 'ecomso_settings',
		'esb_ga4_settings'               => 'ecomso_ga4_settings',
		'esb_last_connection'            => 'ecomso_last_connection',
		'esb_settings_rev'               => 'ecomso_settings_rev',
		'esb_version'                    => 'ecomso_version',
		'esb_cache_notice_dismissed'     => 'ecomso_cache_notice_dismissed',
		'esb_saas_pipeline_merchant_key' => 'ecomso_saas_pipeline_merchant_key',
		'esb_saas_pipeline_api_base'     => 'ecomso_saas_pipeline_api_base',
		'esb_migrated_from_fct'          => 'ecomso_migrated_from_fct',
	);

	private const META_MAP = array(
		'_fct_buying_cost'     => '_ecomso_buying_cost',
		'_fct_packaging_cost'  => '_ecomso_packaging_cost',
		'_fct_extra_cost'      => '_ecomso_extra_cost',
		'_fct_item_total_cost' => '_ecomso_item_total_cost',
		'_fct_ads_cpa'         => '_ecomso_ads_cpa',
	);

	private const LEGACY_ESB_META_MAP = array(
		'_esb_buying_cost'     => '_ecomso_buying_cost',
		'_esb_packaging_cost'  => '_ecomso_packaging_cost',
		'_esb_extra_cost'      => '_ecomso_extra_cost',
		'_esb_item_total_cost' => '_ecomso_item_total_cost',
		'_esb_ads_cpa'         => '_ecomso_ads_cpa',
		'_esb_user_id'         => '_ecomso_user_id',
		'_esb_session_id'      => '_ecomso_session_id',
		'_esb_session_number'  => '_ecomso_session_number',
		'_esb_journey_id'      => '_ecomso_journey_id',
	);

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_migrate' ), 1 );
	}

	public static function maybe_migrate(): void {
		self::migrate_esb_prefix();
		$done = get_option( 'ecomso_migrated_from_fct', '' );
		if ( $done === ECOMSO_VERSION || $done === '1' ) {
			return;
		}
		self::migrate_options( self::OPTION_MAP );
		self::migrate_post_meta( self::META_MAP );
		update_option( 'ecomso_migrated_from_fct', ECOMSO_VERSION, false );
		if ( class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}
	}

	private static function migrate_esb_prefix(): void {
		if ( get_option( 'ecomso_migrated_from_esb', '' ) === '1' ) {
			return;
		}
		self::migrate_options( self::LEGACY_ESB_OPTION_MAP );
		self::migrate_post_meta( self::LEGACY_ESB_META_MAP );
		update_option( 'ecomso_migrated_from_esb', '1', false );
		if ( class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}
	}

	/**
	 * @param array<string,string> $map
	 */
	private static function migrate_options( array $map ): void {
		foreach ( $map as $old => $new ) {
			$val = get_option( $old, null );
			if ( null === $val ) {
				continue;
			}
			if ( null === get_option( $new, null ) ) {
				update_option( $new, $val, false );
			}
		}
	}

	/**
	 * @param array<string,string> $map
	 */
	private static function migrate_post_meta( array $map ): void {
		global $wpdb;
		foreach ( $map as $old => $new ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->postmeta} SET meta_key = %s WHERE meta_key = %s",
					$new,
					$old
				)
			);
		}
	}

	/** Read cost meta (supports legacy _fct_* / _esb_* if migration not run yet). */
	public static function get_cost_meta( int $post_id, string $ecomso_key ): string {
		$val = get_post_meta( $post_id, $ecomso_key, true );
		if ( $val !== '' && $val !== null ) {
			return is_string( $val ) ? $val : (string) $val;
		}
		foreach ( array( '_fct_', '_esb_' ) as $legacy_prefix ) {
			$legacy = str_replace( '_ecomso_', $legacy_prefix, $ecomso_key );
			$old    = get_post_meta( $post_id, $legacy, true );
			if ( $old !== '' && $old !== null ) {
				return is_string( $old ) ? $old : (string) $old;
			}
		}
		return '';
	}
}
