<?php
/**
 * Uncached runtime tracker config (fixes Pantheon / WP Fastest Cache stale Merchant ID for guests).
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		self::register_ecomso_routes( 'ecomso/v1' );
		/** @deprecated 1.0.60 — cached HTML may still call esb/v1 until cache clears. */
		self::register_ecomso_routes( 'esb/v1' );
		/** @deprecated 1.0 — cached HTML may still call fct/v1 until cache clears. */
		self::register_ecomso_routes( 'fct/v1' );
	}

	/**
	 * @param string $namespace ecomso/v1, legacy esb/v1, or legacy fct/v1
	 */
	private static function register_ecomso_routes( string $namespace ): void {
		register_rest_route(
			$namespace,
			'/tracker-config',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'tracker_config' ),
			)
		);
		register_rest_route(
			$namespace,
			'/product-ecommerce',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'product_ecommerce' ),
				'args'                => array(
					'product_id' => array(
						'required'          => true,
						'type'              => 'integer',
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $v ) {
							return is_numeric( $v ) && (int) $v > 0;
						},
					),
				),
			)
		);
		register_rest_route(
			$namespace,
			'/cart-ecommerce',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'cart_ecommerce' ),
			)
		);
		register_rest_route(
			$namespace,
			'/ingest',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'proxy_ingest' ),
			)
		);
		register_rest_route(
			$namespace,
			'/master-ingest',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'proxy_master_ingest' ),
			)
		);
		register_rest_route(
			$namespace,
			'/attribution-config',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'proxy_attribution_config' ),
			)
		);
	}

	/** @return WP_REST_Response|WP_Error */
	public static function proxy_ingest( WP_REST_Request $request ) {
		return self::proxy_ingest_path( $request, '/v1/tracking/collect' );
	}

	/** @return WP_REST_Response|WP_Error */
	public static function proxy_master_ingest( WP_REST_Request $request ) {
		return self::proxy_ingest_path( $request, '/v1/events/master-ingest' );
	}

	/**
	 * @return WP_REST_Response|WP_Error
	 */
	private static function proxy_ingest_path( WP_REST_Request $request, string $upstream_path ) {
		if ( ! class_exists( 'ECOMSO_First_Party' ) || ! class_exists( 'ECOMSO_Admin' ) ) {
			return new WP_Error( 'ecomso_unavailable', 'Tracker not loaded', array( 'status' => 503 ) );
		}
		if ( ! ECOMSO_Admin::has_tracker_credentials() ) {
			return new WP_Error( 'ecomso_disabled', 'Tracking not configured', array( 'status' => 503 ) );
		}

		$s   = get_option( 'ecomso_settings', array() );
		$s   = is_array( $s ) ? $s : array();
		$mid = isset( $s['merchant_id'] ) ? trim( (string) $s['merchant_id'] ) : '';
		$api = isset( $s['api_base'] ) ? (string) $s['api_base'] : '';
		$key = $request->get_header( 'x-merchant-key' );
		if ( ! is_string( $key ) || trim( $key ) === '' ) {
			$key = $request->get_param( 'key' );
		}
		if ( is_string( $key ) && trim( $key ) !== '' ) {
			$mid = sanitize_text_field( trim( $key ) );
		}

		$body = $request->get_body();
		if ( ! is_string( $body ) ) {
			$body = '';
		}

		$client_ua = '';
		$decoded   = json_decode( $body, true );
		if ( is_array( $decoded ) && isset( $decoded['client_user_agent'] ) && is_string( $decoded['client_user_agent'] ) ) {
			$client_ua = trim( $decoded['client_user_agent'] );
		}
		if ( $client_ua === '' ) {
			$incoming = $request->get_header( 'user-agent' );
			if ( is_string( $incoming ) ) {
				$client_ua = trim( $incoming );
			}
		}

		$result = ECOMSO_First_Party::proxy_post(
			$upstream_path,
			$body,
			$api,
			$mid,
			$client_ua !== '' ? $client_ua : null,
			self::forward_ingest_headers( $request )
		);
		$decoded = json_decode( $result['body'], true );
		if ( is_array( $decoded ) ) {
			return self::nocache_json( $decoded, $result['code'] );
		}
		$response = new WP_REST_Response( $result['body'], $result['code'] );
		$response->header( 'Content-Type', 'application/json' );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		return $response;
	}

	/**
	 * Preserve verified client IP for SaaS ingest (never trust public REST request headers).
	 *
	 * @return array<string,string>
	 */
	private static function forward_ingest_headers( WP_REST_Request $request ): array {
		unset( $request );
		if ( ! class_exists( 'ECOMSO_Http' ) ) {
			return array();
		}
		return ECOMSO_Http::trusted_visitor_forward_headers();
	}

	/** @return WP_REST_Response|WP_Error */
	public static function proxy_attribution_config( WP_REST_Request $request ) {
		if ( ! class_exists( 'ECOMSO_First_Party' ) || ! class_exists( 'ECOMSO_Admin' ) ) {
			return new WP_Error( 'ecomso_unavailable', 'Tracker not loaded', array( 'status' => 503 ) );
		}
		if ( ! ECOMSO_Admin::has_tracker_credentials() ) {
			return new WP_Error( 'ecomso_disabled', 'Tracking not configured', array( 'status' => 503 ) );
		}

		$s   = get_option( 'ecomso_settings', array() );
		$s   = is_array( $s ) ? $s : array();
		$mid = isset( $s['merchant_id'] ) ? trim( (string) $s['merchant_id'] ) : '';
		$api = isset( $s['api_base'] ) ? (string) $s['api_base'] : '';
		$key = $request->get_param( 'key' );
		if ( is_string( $key ) && trim( $key ) !== '' ) {
			$mid = sanitize_text_field( trim( $key ) );
		}

		$result  = ECOMSO_First_Party::proxy_get( '/v1/tracking/attribution-config', $api, $mid );
		$decoded = json_decode( $result['body'], true );
		if ( is_array( $decoded ) ) {
			return self::nocache_json( $decoded, $result['code'] );
		}
		$response = new WP_REST_Response( $result['body'], $result['code'] );
		$response->header( 'Content-Type', 'application/json' );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		return $response;
	}

	/** @return WP_REST_Response|WP_Error */
	public static function product_ecommerce( WP_REST_Request $request ) {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return new WP_Error( 'ecomso_no_wc', 'WooCommerce not available', array( 'status' => 503 ) );
		}
		if ( ! class_exists( 'ECOMSO_WC', false ) ) {
			$wc_file = defined( 'ECOMSO_DIR' ) ? ECOMSO_DIR . 'includes/class-ecomso-wc.php' : '';
			if ( $wc_file && is_readable( $wc_file ) ) {
				require_once $wc_file;
			}
		}
		if ( ! class_exists( 'ECOMSO_WC' ) ) {
			return new WP_Error( 'ecomso_no_wc', 'WooCommerce bridge not loaded', array( 'status' => 503 ) );
		}
		$pid = (int) $request->get_param( 'product_id' );
		if ( ! class_exists( 'ECOMSO_WC' ) || ! ECOMSO_WC::is_product_publicly_viewable( $pid ) ) {
			return new WP_Error( 'ecomso_not_found', 'Product not found', array( 'status' => 404 ) );
		}
		$eco = ECOMSO_WC::product_ecommerce_for_id( $pid );
		if ( ! is_array( $eco ) ) {
			return new WP_Error( 'ecomso_not_found', 'Product not found', array( 'status' => 404 ) );
		}
		return self::nocache_json( array( 'data' => $eco ) );
	}

	/** @return WP_REST_Response|WP_Error */
	public static function cart_ecommerce( WP_REST_Request $request ) {
		unset( $request );
		if ( ! class_exists( 'WooCommerce' ) ) {
			return new WP_Error( 'ecomso_no_wc', 'WooCommerce not available', array( 'status' => 503 ) );
		}
		if ( ! class_exists( 'ECOMSO_WC', false ) ) {
			$wc_file = defined( 'ECOMSO_DIR' ) ? ECOMSO_DIR . 'includes/class-ecomso-wc.php' : '';
			if ( $wc_file && is_readable( $wc_file ) ) {
				require_once $wc_file;
			}
		}
		if ( ! class_exists( 'ECOMSO_WC' ) ) {
			return new WP_Error( 'ecomso_no_wc', 'WooCommerce bridge not loaded', array( 'status' => 503 ) );
		}
		$eco = ECOMSO_WC::cart_ecommerce_payload();
		if ( ! is_array( $eco ) ) {
			$eco = array(
				'currency' => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '',
				'value'    => 0,
				'items'    => array(),
			);
		}
		return self::nocache_json( array( 'data' => $eco ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function nocache_json( array $body, int $status = 200 ): WP_REST_Response {
		$response = new WP_REST_Response( $body, $status );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		$response->header( 'Pragma', 'no-cache' );
		$response->header( 'Expires', '0' );
		return $response;
	}

	/**
	 * Emits the same `TrackerConfigCoreFields` shape documented in
	 * `server/src/tracking/tracker-config-contract.ts` (Universal Tracking Architecture Audit,
	 * Phase E) — kept as PHP here since this runs in WordPress's own runtime, not shared code with
	 * the TS builders, but field names/semantics must stay in sync with that contract. Response is
	 * `{ data: {...} }`; ESB/Shopify builders return the same fields flat (documented, not enforced).
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public static function tracker_config( WP_REST_Request $request ) {
		unset( $request );
		if ( ! class_exists( 'ECOMSO_Enqueue' ) || ! class_exists( 'ECOMSO_Admin' ) ) {
			return new WP_Error( 'ecomso_unavailable', 'Tracker not loaded', array( 'status' => 503 ) );
		}
		if ( ! ECOMSO_Admin::has_tracker_credentials() ) {
			return new WP_Error( 'ecomso_disabled', 'Tracking not configured', array( 'status' => 503 ) );
		}

		$s = get_option( 'ecomso_settings', array() );
		$s = is_array( $s ) ? $s : array();
		if ( class_exists( 'ECOMSO_Config' ) ) {
			$s = ECOMSO_Config::merge_settings( $s );
		}
		if ( class_exists( 'ECOMSO_First_Party' ) ) {
			ECOMSO_First_Party::sync_from_saas();
			$s = get_option( 'ecomso_settings', array() );
			$s = is_array( $s ) ? $s : array();
			if ( class_exists( 'ECOMSO_Config' ) ) {
				$s = ECOMSO_Config::merge_settings( $s );
			}
		}
		$mid = isset( $s['merchant_id'] ) ? sanitize_text_field( (string) $s['merchant_id'] ) : '';
		$api = isset( $s['api_base'] ) ? (string) $s['api_base'] : '';
		if ( $mid === '' || $api === '' ) {
			return new WP_Error( 'ecomso_incomplete', 'Missing API URL or Merchant ID', array( 'status' => 503 ) );
		}

		$browser = class_exists( 'ECOMSO_First_Party' )
			? ECOMSO_First_Party::browser_endpoints( $s )
			: array(
				'endpoint'             => ECOMSO_Enqueue::ingest_url_with_key(
					! empty( $s['use_master_ingest'] ) ? '/v1/events/master-ingest' : '/v1/tracking/collect',
					$api,
					$mid
				),
				'attributionConfigUrl' => ECOMSO_Enqueue::ingest_url_with_key( '/v1/tracking/attribution-config', $api, $mid ),
				'ingestMode'           => 'direct_api',
				'credentials'          => 'omit',
				'trackingHostname'     => '',
			);

		$url = isset( $browser['endpoint'] ) ? (string) $browser['endpoint'] : '';
		if ( $url === '' ) {
			return new WP_Error( 'ecomso_bad_url', 'Invalid API base URL', array( 'status' => 400 ) );
		}

		$site_key = isset( $s['site_key'] ) ? sanitize_text_field( (string) $s['site_key'] ) : '';
		$batch    = isset( $s['batch_flush_ms'] ) ? max( 0, (int) $s['batch_flush_ms'] ) : 5000;
		$extra    = class_exists( 'ECOMSO_Http' ) ? ECOMSO_Http::tracker_request_headers( $url ) : array();

		$ver  = ECOMSO_VERSION;
		$base = trailingslashit( ECOMSO_URL ) . 'assets/js/';

		$wc_bridge = class_exists( 'WooCommerce' ) && ECOMSO_Enqueue::should_load_wc_bridge();

		$cart_eco = null;
		if ( class_exists( 'WooCommerce' ) && class_exists( 'ECOMSO_WC', false ) ) {
			if ( ! class_exists( 'ECOMSO_WC' ) ) {
				$wc_file = defined( 'ECOMSO_DIR' ) ? ECOMSO_DIR . 'includes/class-ecomso-wc.php' : '';
				if ( $wc_file && is_readable( $wc_file ) ) {
					require_once $wc_file;
				}
			}
			if ( class_exists( 'ECOMSO_WC' ) ) {
				$cart_eco = ECOMSO_WC::cart_ecommerce_payload();
			}
		}

		$attr_url = isset( $browser['attributionConfigUrl'] ) ? (string) $browser['attributionConfigUrl'] : '';
		$creds    = isset( $browser['credentials'] ) ? (string) $browser['credentials'] : 'omit';

		$data = array(
			'endpoint'             => $url,
			'attributionConfigUrl' => $attr_url,
			'ingestMode'           => isset( $browser['ingestMode'] ) ? (string) $browser['ingestMode'] : '',
			'trackingHostname'     => isset( $browser['trackingHostname'] ) ? (string) $browser['trackingHostname'] : '',
			'configEndpoint'       => class_exists( 'ECOMSO_First_Party' )
				? ECOMSO_First_Party::tracker_config_rest_url()
				: rest_url( 'ecomso/v1/tracker-config' ),
			'wcDataBase'           => rest_url( 'ecomso/v1/' ),
			'merchantId'           => $mid,
			'configRevision'       => class_exists( 'ECOMSO_Cache' ) ? ECOMSO_Cache::settings_revision() : 1,
			'pluginVersion'        => $ver,
			'loadWcBridge'         => $wc_bridge,
			'scriptUrls'           => array(
				'tracker' => $base . 'ecomsolvebd.js?ver=' . rawurlencode(
					ECOMSO_Enqueue::asset_file_version( 'assets/js/ecomsolvebd.js' )
				),
				'bridge'  => $base . 'ecomso-wc-bridge.js?ver=' . rawurlencode(
					ECOMSO_Enqueue::asset_file_version( 'assets/js/ecomso-wc-bridge.js' )
				),
				'runtime' => $base . 'ecomso-runtime.js?ver=' . rawurlencode(
					ECOMSO_Enqueue::asset_file_version( 'assets/js/ecomso-runtime.js' )
				),
			),
			'siteKey'              => $site_key,
			'batchFlushMs'         => $batch,
			'autoPageView'         => true,
			'credentials'          => $creds,
			'requestHeaders'       => $extra,
			'cartEcommerce'        => is_array( $cart_eco ) && ! empty( $cart_eco['items'] ) ? $cart_eco : null,
		);

		$response = new WP_REST_Response( array( 'data' => $data ), 200 );
		$response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
		$response->header( 'Pragma', 'no-cache' );
		$response->header( 'Expires', '0' );
		return $response;
	}
}
