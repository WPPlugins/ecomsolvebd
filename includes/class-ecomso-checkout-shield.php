<?php
/**
 * Checkout Shield for WooCommerce (classic checkout + Checkout Block).
 *
 * Browser: a small local script (assets/js/ecomso-checkout-shield.js) checks the phone on the 11th digit and
 * shows a Bangla SMS-code dialog when the store asks for it.
 * Server: right before WooCommerce saves the order, PHP asks the EcomSolveBD API whether this phone may
 * order (verified / allowed / repeat-order timer). The shopper cannot skip this step.
 *
 * Fail-open: if the API is slow, unreachable or answers oddly, the order is saved as usual.
 * Inert unless EcomSolveBD Super Admin turned Checkout Shield on for this store.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Checkout_Shield {

	/** Max seconds the order may wait for our answer. */
	private const VERIFY_TIMEOUT = 8;

	/** @var array<string,array<string,mixed>> per-request cache by phone */
	private static $cache = array();

	public static function init(): void {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 30 );
		// Classic checkout (shortcode / most themes).
		add_action( 'woocommerce_after_checkout_validation', array( __CLASS__, 'validate_classic' ), 20, 2 );
		// Checkout Block (Store API).
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( __CLASS__, 'validate_block' ), 20, 2 );
	}

	/** @return array{api:string,key:string} */
	private static function creds(): array {
		$stored = get_option( 'ecomso_settings', array() );
		$merged = class_exists( 'ECOMSO_Config' ) && is_array( $stored )
			? ECOMSO_Config::merge_settings( $stored )
			: ( is_array( $stored ) ? $stored : array() );
		return array(
			'api' => ECOMSO_Enqueue::normalize_api_base( (string) ( $merged['api_base'] ?? '' ) ),
			'key' => trim( (string) ( $merged['merchant_id'] ?? '' ) ),
		);
	}

	public static function enqueue(): void {
		if ( ! function_exists( 'is_checkout' ) || ! is_checkout() || ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) ) {
			return;
		}
		$c = self::creds();
		if ( '' === $c['api'] || '' === $c['key'] ) {
			return;
		}
		$file = ECOMSO_DIR . 'assets/js/ecomso-checkout-shield.js';
		if ( ! is_readable( $file ) ) {
			return;
		}
		wp_enqueue_script(
			'ecomso-checkout-shield',
			ECOMSO_URL . 'assets/js/ecomso-checkout-shield.js',
			array(),
			(string) filemtime( $file ),
			true
		);
		wp_add_inline_script(
			'ecomso-checkout-shield',
			'window.ESB_CHECKOUT_SHIELD=' . wp_json_encode(
				array(
					'merchantKey' => $c['key'],
					'api'         => $c['api'],
				)
			) . ';',
			'before'
		);
	}

	/**
	 * Ask the API. Always returns an array with `allow` (bool) and `message` (string).
	 *
	 * @return array{allow:bool,message:string}
	 */
	public static function verify( string $phone ): array {
		$allow = array(
			'allow'   => true,
			'message' => '',
		);
		$digits = preg_replace( '/\D+/', '', $phone );
		if ( ! is_string( $digits ) || strlen( $digits ) < 10 ) {
			return $allow;
		}
		if ( isset( self::$cache[ $digits ] ) ) {
			return self::$cache[ $digits ];
		}
		$c = self::creds();
		if ( '' === $c['api'] || '' === $c['key'] ) {
			return $allow;
		}
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		$ip   = class_exists( 'WC_Geolocation' ) ? WC_Geolocation::get_ip_address() : '';
		$url  = $c['api'] . '/v1/checkout-shield/public/verify-order';
		$args = array(
			'timeout' => self::VERIFY_TIMEOUT,
			'headers' => array(
				'Content-Type'   => 'application/json',
				'Accept'         => 'application/json',
				'x-merchant-key' => $c['key'],
			),
			'body'    => wp_json_encode(
				array(
					'merchant_key' => $c['key'],
					'host'         => is_string( $host ) ? $host : '',
					'phone'        => $phone,
					'customer_ip'  => $ip,
				)
			),
		);
		if ( class_exists( 'ECOMSO_Http' ) ) {
			$args = ECOMSO_Http::remote_args( $args, $url );
		}
		$res = wp_remote_post( $url, $args );
		$out = $allow;
		if ( ! is_wp_error( $res ) && 200 === (int) wp_remote_retrieve_response_code( $res ) ) {
			$json = json_decode( (string) wp_remote_retrieve_body( $res ), true );
			$data = is_array( $json ) && isset( $json['data'] ) && is_array( $json['data'] ) ? $json['data'] : null;
			// Only an explicit `allow: false` stops the order — anything unexpected lets it through.
			if ( is_array( $data ) && array_key_exists( 'allow', $data ) && false === $data['allow'] ) {
				$msg = isset( $data['message'] ) && is_string( $data['message'] ) && '' !== $data['message']
					? $data['message']
					: 'অর্ডার নিশ্চিত করতে মোবাইলে পাঠানো কোড দিন।';
				$out = array(
					'allow'   => false,
					'message' => $msg,
				);
			}
		}
		self::$cache[ $digits ] = $out;
		return $out;
	}

	/**
	 * @param array<string,mixed> $data
	 * @param \WP_Error           $errors
	 */
	public static function validate_classic( $data, $errors ): void {
		if ( ! is_array( $data ) || ! ( $errors instanceof \WP_Error ) ) {
			return;
		}
		// Other required-field errors first — no API call for a form that cannot be saved anyway.
		if ( $errors->has_errors() ) {
			return;
		}
		$phone = (string) ( $data['billing_phone'] ?? ( $data['shipping_phone'] ?? '' ) );
		$r     = self::verify( $phone );
		if ( ! $r['allow'] ) {
			$errors->add( 'ecomso_checkout_shield', esc_html( $r['message'] ) );
		}
	}

	/**
	 * @param \WC_Order        $order
	 * @param \WP_REST_Request $request
	 */
	public static function validate_block( $order, $request ): void {
		if ( ! is_object( $order ) || ! method_exists( $order, 'get_billing_phone' ) ) {
			return;
		}
		$phone = (string) $order->get_billing_phone();
		if ( '' === $phone && method_exists( $order, 'get_shipping_phone' ) ) {
			$phone = (string) $order->get_shipping_phone();
		}
		$r = self::verify( $phone );
		if ( $r['allow'] ) {
			return;
		}
		if ( class_exists( '\Automattic\WooCommerce\StoreApi\Exceptions\RouteException' ) ) {
			throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException(
				'ecomso_checkout_shield',
				esc_html( $r['message'] ),
				400
			);
		}
	}
}
