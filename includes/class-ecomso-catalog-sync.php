<?php
/**
 * Sync product feed settings + fetch to EcomSolveBD SaaS API.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Catalog_Sync {

	/** @return array<string,mixed> */
	private static function settings(): array {
		$defaults = array(
			'api_base'    => '',
			'merchant_id' => '',
		);
		$stored = get_option( 'ecomso_settings', array() );
		return wp_parse_args( is_array( $stored ) ? $stored : array(), $defaults );
	}

	private static function api_base(): string {
		$s = self::settings();
		return ECOMSO_Enqueue::normalize_api_base( (string) ( $s['api_base'] ?? '' ) );
	}

	private static function merchant_key(): string {
		$s = self::settings();
		return trim( (string) ( $s['merchant_id'] ?? '' ) );
	}

	/**
	 * @param string               $method
	 * @param string               $path e.g. /v1/products/feed
	 * @param array<string,mixed>|null $body
	 * @return array{ok:bool,code:int,body:array<string,mixed>|null,error:string}
	 */
	private static function request( string $method, string $path, ?array $body = null ): array {
		$base = self::api_base();
		$key  = self::merchant_key();
		if ( $base === '' || $key === '' ) {
			return array(
				'ok'    => false,
				'code'  => 0,
				'body'  => null,
				'error' => __( 'Configure API base URL and Merchant ID under EcomSolveBD → Settings.', 'ecomsolvebd' ),
			);
		}

		$url  = rtrim( $base, '/' ) . $path;
		$args = array(
			'method'      => $method,
			'timeout'     => 45,
			'redirection' => 5,
			'headers'     => array(
				'Accept'           => 'application/json',
				'Content-Type'     => 'application/json',
				'x-merchant-key'   => $key,
				'User-Agent'       => 'WordPress/ecomsolvebd; ' . home_url( '/' ),
			),
		);

		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}

		if ( class_exists( 'ECOMSO_Http' ) ) {
			$args = ECOMSO_Http::remote_args( $args, $url );
		}

		$res = wp_remote_request( $url, $args );
		if ( is_wp_error( $res ) ) {
			return array(
				'ok'    => false,
				'code'  => 0,
				'body'  => null,
				'error' => $res->get_error_message(),
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $res );
		$raw  = (string) wp_remote_retrieve_body( $res );
		$json = json_decode( $raw, true );
		$data = is_array( $json ) ? $json : null;

		if ( $code < 200 || $code >= 300 ) {
			$msg = __( 'API request failed.', 'ecomsolvebd' );
			if ( is_array( $data ) && isset( $data['error']['message'] ) && is_string( $data['error']['message'] ) ) {
				$msg = $data['error']['message'];
			}
			return array(
				'ok'    => false,
				'code'  => $code,
				'body'  => $data,
				'error' => $msg,
			);
		}

		return array(
			'ok'    => true,
			'code'  => $code,
			'body'  => $data,
			'error' => '',
		);
	}

	/** @return array{ok:bool,data:array<string,mixed>|null,error:string} */
	public static function get_feed_settings(): array {
		$r = self::request( 'GET', '/v1/products/feed' );
		if ( ! $r['ok'] || ! is_array( $r['body'] ) ) {
			return array( 'ok' => false, 'data' => null, 'error' => $r['error'] );
		}
		$data = isset( $r['body']['data'] ) && is_array( $r['body']['data'] ) ? $r['body']['data'] : null;
		return array( 'ok' => true, 'data' => $data, 'error' => '' );
	}

	/**
	 * @param array{feedUrl:string,autoFetchMinutes:int} $input
	 * @return array{ok:bool,data:array<string,mixed>|null,error:string}
	 */
	public static function patch_feed_settings( array $input ): array {
		$r = self::request(
			'PATCH',
			'/v1/products/feed',
			array(
				'feedUrl'          => $input['feedUrl'],
				'autoFetchMinutes' => (int) $input['autoFetchMinutes'],
			)
		);
		if ( ! $r['ok'] || ! is_array( $r['body'] ) ) {
			return array( 'ok' => false, 'data' => null, 'error' => $r['error'] );
		}
		$data = isset( $r['body']['data'] ) && is_array( $r['body']['data'] ) ? $r['body']['data'] : null;
		return array( 'ok' => true, 'data' => $data, 'error' => '' );
	}

	/** @return array{ok:bool,data:array<string,mixed>|null,error:string} */
	public static function sync_feed_now(): array {
		$r = self::request( 'POST', '/v1/products/feed/sync' );
		if ( ! $r['ok'] || ! is_array( $r['body'] ) ) {
			return array( 'ok' => false, 'data' => null, 'error' => $r['error'] );
		}
		$data = isset( $r['body']['data'] ) && is_array( $r['body']['data'] ) ? $r['body']['data'] : null;
		return array( 'ok' => true, 'data' => $data, 'error' => '' );
	}

	/** @return list<array{value:int,label:string}> */
	public static function auto_fetch_options(): array {
		return array(
			array( 'value' => 0, 'label' => __( 'Off — manual only', 'ecomsolvebd' ) ),
			array( 'value' => 15, 'label' => __( 'Every 15 minutes', 'ecomsolvebd' ) ),
			array( 'value' => 30, 'label' => __( 'Every 30 minutes', 'ecomsolvebd' ) ),
			array( 'value' => 60, 'label' => __( 'Every hour', 'ecomsolvebd' ) ),
			array( 'value' => 360, 'label' => __( 'Every 6 hours', 'ecomsolvebd' ) ),
			array( 'value' => 1440, 'label' => __( 'Every 24 hours', 'ecomsolvebd' ) ),
		);
	}
}
