<?php
/**
 * Outbound HTTP helpers (ngrok interstitial bypass, JSON GET).
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Http {

	/** Whether the host is an ngrok tunnel (free tier needs a special header). */
	public static function is_ngrok_host( string $host ): bool {
		$h = strtolower( trim( $host ) );
		return $h !== '' && false !== strpos( $h, 'ngrok' );
	}

	/**
	 * @param array<string,string> $headers
	 * @return array<string,string>
	 */
	public static function with_ngrok_headers( array $headers, string $url ): array {
		$parsed = wp_parse_url( $url );
		$host   = is_array( $parsed ) && isset( $parsed['host'] ) ? (string) $parsed['host'] : '';
		if ( self::is_ngrok_host( $host ) ) {
			$headers['ngrok-skip-browser-warning'] = 'true';
		}
		return $headers;
	}

	/**
	 * Headers for browser tracker config (merged into fetch).
	 *
	 * @return array<string,string>
	 */
	public static function tracker_request_headers( string $endpoint_url ): array {
		return self::with_ngrok_headers( array(), $endpoint_url );
	}

	/**
	 * @param array<string,mixed> $args wp_remote_* args
	 * @return array<string,mixed>
	 */
	public static function remote_args( array $args, string $url ): array {
		$headers = isset( $args['headers'] ) && is_array( $args['headers'] ) ? $args['headers'] : array();
		$args['headers'] = self::with_ngrok_headers( $headers, $url );
		return $args;
	}

	/**
	 * @param array<string,mixed> $args
	 * @return array{ok:bool,code:int,body:string,is_json:bool}
	 */
	public static function remote_get( string $url, array $args = array() ): array {
		$args = self::remote_args( $args, $url );
		$res  = wp_remote_get( $url, $args );
		if ( is_wp_error( $res ) ) {
			return array(
				'ok'      => false,
				'code'    => 0,
				'body'    => $res->get_error_message(),
				'is_json' => false,
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		$trim = ltrim( $body );
		$json = $trim !== '' && ( $trim[0] === '{' || $trim[0] === '[' );
		return array(
			'ok'      => $code >= 200 && $code < 300,
			'code'    => $code,
			'body'    => $body,
			'is_json' => $json,
		);
	}

	/**
	 * Read a sanitized value from the PHP request environment.
	 */
	public static function server_string( string $key ): string {
		if ( ! isset( $_SERVER[ $key ] ) || ! is_string( $_SERVER[ $key ] ) ) {
			return '';
		}
		return sanitize_text_field( wp_unslash( $_SERVER[ $key ] ) );
	}

	/**
	 * Validate a single IP (IPv4/IPv6). Returns empty string when invalid.
	 */
	public static function sanitize_ip_string( string $raw ): string {
		$raw = trim( $raw );
		if ( $raw === '' ) {
			return '';
		}
		if ( false !== strpos( $raw, ',' ) ) {
			$parts = explode( ',', $raw );
			$raw   = trim( (string) ( $parts[0] ?? '' ) );
		}
		return filter_var( $raw, FILTER_VALIDATE_IP ) ? $raw : '';
	}

	/**
	 * Visitor identity headers derived from the inbound HTTP connection only.
	 *
	 * Public REST clients must not supply IP/geo via request headers (trivially spoofed).
	 * We only trust edge-injected $_SERVER values when accompanied by a proxy signal
	 * (e.g. Cloudflare CF-Ray), otherwise fall back to REMOTE_ADDR.
	 *
	 * @return array<string,string>
	 */
	public static function trusted_visitor_forward_headers(): array {
		$headers = array();

		$cf_ip  = self::sanitize_ip_string( self::server_string( 'HTTP_CF_CONNECTING_IP' ) );
		$cf_ray = self::server_string( 'HTTP_CF_RAY' );
		if ( $cf_ip !== '' && $cf_ray !== '' ) {
			$headers['X-ESB-Client-IP'] = $cf_ip;
			$headers['X-Real-IP']         = $cf_ip;
			$country                      = strtoupper( self::server_string( 'HTTP_CF_IPCOUNTRY' ) );
			if ( strlen( $country ) === 2 && 'XX' !== $country && 'T1' !== $country ) {
				$headers['X-ESB-Client-Country'] = $country;
				$headers['X-Country-Code']       = $country;
			}
			/** @param array<string,string> $headers */
			return apply_filters( 'ecomso_trusted_visitor_forward_headers', $headers );
		}

		$remote = self::sanitize_ip_string( self::server_string( 'REMOTE_ADDR' ) );
		if ( $remote !== '' ) {
			$headers['X-ESB-Client-IP'] = $remote;
			$headers['X-Real-IP']       = $remote;
		}

		/** @param array<string,string> $headers */
		return apply_filters( 'ecomso_trusted_visitor_forward_headers', $headers );
	}

	/**
	 * Headers allowed to be merged from a prior trusted_visitor_forward_headers() pass.
	 *
	 * @return array<string,string>
	 */
	public static function whitelist_forward_headers( array $forward_headers ): array {
		$allowed = array(
			'x-esb-client-ip',
			'x-esb-client-country',
			'x-real-ip',
			'x-forwarded-for',
			'x-country-code',
		);
		$out     = array();
		foreach ( $forward_headers as $name => $value ) {
			if ( ! is_string( $name ) || ! is_string( $value ) ) {
				continue;
			}
			$lower = strtolower( trim( $name ) );
			$val   = trim( $value );
			if ( $val === '' || ! in_array( $lower, $allowed, true ) ) {
				continue;
			}
			if ( false !== strpos( $lower, 'ip' ) ) {
				$val = self::sanitize_ip_string( $val );
				if ( $val === '' && 'x-esb-client-country' !== $lower && 'x-country-code' !== $lower ) {
					continue;
				}
			}
			if ( 'x-esb-client-country' === $lower || 'x-country-code' === $lower ) {
				$val = strtoupper( $val );
				if ( strlen( $val ) !== 2 || 'XX' === $val || 'T1' === $val ) {
					continue;
				}
			}
			$out[ $name ] = $val;
		}
		return $out;
	}
}
