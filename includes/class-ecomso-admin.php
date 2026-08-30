<?php
/**
 * Settings page — API base, merchant id, batch interval.
 *
 * @package EcomSolveBD_Tracker
 */

defined('ABSPATH') || exit;

final class ECOMSO_Admin {

	private const OPT_KEY = 'ecomso_settings';

	/** @var bool Sanitize callback can run more than once per save (WP / duplicate plugin copies). */
	private static $validation_notice_added = false;

	private const CONN_OPT = 'ecomso_last_connection';

	public static function init(): void {
		add_action('admin_menu', array(__CLASS__, 'menu'), 9);
		add_action('admin_init', array(__CLASS__, 'register'));
		add_action('wp_ajax_ecomso_test_connection', array(__CLASS__, 'ajax_test_connection'));
		add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_settings_assets'));
		add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_feed_assets'));
		add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_menu_icon_css'));
		add_action('admin_notices', array(__CLASS__, 'maybe_tracking_paused_notice'));
	}

	/** Warn when storefront tracking is off due to an invalid Merchant ID (plugin screens only). */
	public static function maybe_tracking_paused_notice(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		$page   = isset( $_GET['page'] ) ? sanitize_key( (string) wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$on_esb = ( $page === 'ecomsolvebd' || $page === 'ecomso-product-feed' || $page === 'ecomso-ga4' )
			|| ( $screen && isset( $screen->id ) && false !== strpos( (string) $screen->id, 'ecomsolvebd' ) );
		if ( ! $on_esb ) {
			return;
		}
		$conn = self::last_connection_status();
		if ( ! is_array( $conn ) || ! empty( $conn['ok'] ) || ( $conn['reason'] ?? '' ) !== 'bad_key' ) {
			return;
		}
		$url = admin_url( 'admin.php?page=ecomsolvebd' );
		echo '<div class="notice notice-error is-dismissible"><p><strong>' . esc_html__( 'EcomSolveBD:', 'ecomsolvebd' ) . '</strong> ';
		echo esc_html__( 'Storefront tracking is paused because the Merchant ID does not match your API.', 'ecomsolvebd' );
		echo ' <a href="' . esc_url( $url ) . '">' . esc_html__( 'Open settings', 'ecomsolvebd' ) . '</a>';
		echo ' — ' . esc_html__( 'copy Tracking Merchant ID from EcomSolveBD → Integrations → WooCommerce.', 'ecomsolvebd' );
		echo '</p></div>';
	}

	/** @param string $hook */
	public static function enqueue_feed_assets( $hook ): void {
		if ( $hook !== 'ecomsolvebd_page_ecomso-product-feed' ) {
			return;
		}
		wp_enqueue_script(
			'ecomso-admin-feed',
			ECOMSO_URL . 'assets/js/ecomso-admin-feed.js',
			array(),
			ECOMSO_VERSION,
			true
		);
		wp_localize_script(
			'ecomso-admin-feed',
			'ecomsoAdminFeed',
			array(
				'i18n' => array(
					'copied' => __( 'Copied', 'ecomsolvebd' ),
				),
			)
		);
	}

	/** @param string $hook */
	public static function enqueue_settings_assets( $hook ): void {
		if ( $hook !== 'toplevel_page_ecomsolvebd' ) {
			return;
		}
		wp_enqueue_style(
			'ecomso-admin-settings',
			ECOMSO_URL . 'assets/css/ecomso-admin-settings.css',
			array(),
			ECOMSO_VERSION
		);
		wp_enqueue_script(
			'ecomso-admin-settings',
			ECOMSO_URL . 'assets/js/ecomso-admin-settings.js',
			array(),
			ECOMSO_VERSION,
			true
		);
		wp_localize_script(
			'ecomso-admin-settings',
			'ecomsoAdminSettings',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( 'ecomso_test_connection' ),
				'i18n'    => array(
					'testing' => __( 'Testing connection…', 'ecomsolvebd' ),
					'failed'  => __( 'Test failed.', 'ecomsolvebd' ),
				),
			)
		);
	}

	/** Same brand mark as before — white on transparent so it matches Dashicons. */
	public static function enqueue_menu_icon_css(): void {
		$css = '
			#adminmenu .toplevel_page_ecomsolvebd .wp-menu-image img {
				width: 20px;
				height: 20px;
				padding: 7px 0 0;
				opacity: 0.7;
				object-fit: contain;
			}
			#adminmenu .toplevel_page_ecomsolvebd:hover .wp-menu-image img,
			#adminmenu .toplevel_page_ecomsolvebd.wp-has-current-submenu .wp-menu-image img,
			#adminmenu .toplevel_page_ecomsolvebd.current .wp-menu-image img {
				opacity: 1;
			}
		';
		wp_register_style( 'ecomso-admin-menu-icon', false, array(), ECOMSO_VERSION );
		wp_enqueue_style( 'ecomso-admin-menu-icon' );
		wp_add_inline_style( 'ecomso-admin-menu-icon', $css );
	}

	public static function menu(): void {
		$cap  = 'manage_options';
		$icon = defined( 'ECOMSO_URL' ) ? ECOMSO_URL . 'assets/img/ecomsolvebd-menu-icon.png' : 'dashicons-cart';
		// WooCommerce top-level is typically position 55–56 — sit just above it.
		add_menu_page(
			__( 'EcomSolveBD', 'ecomsolvebd' ),
			__( 'EcomSolveBD', 'ecomsolvebd' ),
			$cap,
			'ecomsolvebd',
			array( __CLASS__, 'render' ),
			$icon,
			54
		);
		add_submenu_page(
			'ecomsolvebd',
			__( 'Settings', 'ecomsolvebd' ),
			__( 'Settings', 'ecomsolvebd' ),
			$cap,
			'ecomsolvebd',
			array( __CLASS__, 'render' )
		);
		add_submenu_page(
			'ecomsolvebd',
			__( 'Product Feed Generator', 'ecomsolvebd' ),
			__( 'Product Feed', 'ecomsolvebd' ),
			$cap,
			'ecomso-product-feed',
			array( __CLASS__, 'render_feed_page' )
		);
	}

	public static function register(): void {
		register_setting(
			'ecomso_settings_group',
			self::OPT_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array(__CLASS__, 'sanitize'),
				'default'           => array(),
			)
		);
	}

	private static function current_domain(): string {
		$home = home_url('/');
		$host = wp_parse_url($home, PHP_URL_HOST);
		return is_string($host) ? strtolower($host) : '';
	}

	/**
	 * @return array{ ok: bool, reason: 'ok'|'bad_response'|'bad_key'|'bad_url'|'ngrok_interstitial' }
	 */
	public static function validate_merchant_id_result( string $api_base, string $merchant_id ): array {
		$api_base = rtrim( trim( $api_base ), '/' );
		if ( $api_base === '' || $merchant_id === '' ) {
			return array( 'ok' => false, 'reason' => 'bad_url' );
		}
		$domain = self::current_domain();
		$url    = $api_base . '/v1/tracking/validate-merchant-key?key=' . rawurlencode( $merchant_id );
		if ( $domain !== '' ) {
			$url .= '&domain=' . rawurlencode( $domain );
		}

		$args = array(
			'timeout'     => 25,
			'redirection' => 8,
			'httpversion' => '1.1',
			'headers'     => array(
				'Accept'     => 'application/json',
				'User-Agent' => 'WordPress/ecomsolvebd; ' . ( function_exists( 'home_url' ) ? home_url( '/' ) : 'wp' ),
			),
			'sslverify'   => (bool) apply_filters( 'ecomso_validate_sslverify', true ),
		);

		/** @param array<string,mixed> $args */
		$args = apply_filters( 'ecomso_validate_remote_request_args', $args, $url );

		if ( class_exists( 'ECOMSO_Http' ) ) {
			$res = ECOMSO_Http::remote_get( $url, $args );
		} else {
			$res = array(
				'ok'      => false,
				'code'    => 0,
				'body'    => '',
				'is_json' => false,
			);
		}

		if ( ! $res['ok'] ) {
			$body = (string) $res['body'];
			if ( stripos( $body, 'ngrok' ) !== false && ( stripos( $body, '<html' ) !== false || stripos( $body, 'Visit Site' ) !== false ) ) {
				return array( 'ok' => false, 'reason' => 'ngrok_interstitial' );
			}
			return array( 'ok' => false, 'reason' => 'bad_response' );
		}

		$body = (string) $res['body'];
		$trim = ltrim( $body );
		if ( $trim !== '' && ( $trim[0] === '<' || stripos( $body, '<!DOCTYPE' ) !== false ) ) {
			if ( stripos( $body, 'ngrok' ) !== false ) {
				return array( 'ok' => false, 'reason' => 'ngrok_interstitial' );
			}
			return array( 'ok' => false, 'reason' => 'bad_response' );
		}

		$j = json_decode( $body, true );
		if ( ! is_array( $j ) || empty( $j['ok'] ) ) {
			return array( 'ok' => false, 'reason' => 'bad_key' );
		}
		return array( 'ok' => true, 'reason' => 'ok' );
	}

	/**
	 * Tell SaaS the WordPress plugin is disconnected (pause order ingest).
	 */
	public static function notify_saas_plugin_disconnect( string $api_base, string $merchant_id ): void {
		$api_base    = rtrim( trim( $api_base ), '/' );
		$merchant_id = trim( $merchant_id );
		if ( $api_base === '' || $merchant_id === '' ) {
			return;
		}
		$url  = $api_base . '/v1/tracking/plugin-disconnect?key=' . rawurlencode( $merchant_id );
		$args = array(
			'timeout' => 12,
			'method'  => 'POST',
			'headers' => array(
				'Accept' => 'application/json',
			),
		);
		if ( class_exists( 'ECOMSO_Http' ) ) {
			$args = ECOMSO_Http::remote_args( $args, $url );
		}
		wp_remote_post( $url, $args );
	}

	/** Credentials saved (API base + Merchant ID). */
	public static function has_tracker_credentials(): bool {
		if ( ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return false;
		}
		$stored = get_option( self::OPT_KEY, array() );
		if ( ! is_array( $stored ) ) {
			return false;
		}
		$merged = class_exists( 'ECOMSO_Config' )
			? ECOMSO_Config::merge_settings( $stored )
			: $stored;
		$api_base = isset( $merged['api_base'] ) ? ECOMSO_Enqueue::normalize_api_base( (string) $merged['api_base'] ) : '';
		$mid      = isset( $merged['merchant_id'] ) ? trim( (string) $merged['merchant_id'] ) : '';
		return $api_base !== '' && $mid !== '';
	}

	/**
	 * Whether the storefront tracker may run.
	 * Like v0.3.13–0.3.17: load when credentials exist. Only block after a confirmed bad Merchant ID.
	 * Do not re-validate on every page view (Pantheon → ngrok often fails server-side while the browser works).
	 */
	public static function is_storefront_tracking_enabled(): bool {
		if ( ! self::has_tracker_credentials() ) {
			return false;
		}
		$conn = self::last_connection_status();
		if ( is_array( $conn ) && empty( $conn['ok'] ) && ( $conn['reason'] ?? '' ) === 'bad_key' ) {
			return false;
		}
		return true;
	}

	/** @param array{ok:bool,reason:string} $result */
	public static function record_connection_check( array $result ): void {
		self::persist_connection_status( $result );
	}

	/** @param array{ok:bool,reason:string} $result */
	private static function persist_connection_status( array $result ): void {
		update_option(
			self::CONN_OPT,
			array(
				'ok'         => ! empty( $result['ok'] ),
				'reason'     => isset( $result['reason'] ) ? (string) $result['reason'] : 'bad_response',
				'checked_at' => time(),
			),
			false
		);
	}

	/** @return array{ok:bool,reason:string,checked_at:int}|null */
	public static function last_connection_status(): ?array {
		$raw = get_option( self::CONN_OPT, null );
		return is_array( $raw ) ? $raw : null;
	}

	/**
	 * @param array{ok:bool,reason:string} $result
	 */
	private static function connection_status_message( array $result ): string {
		if ( ! empty( $result['ok'] ) ) {
			return __( 'Connected — API reachable and Merchant ID is valid.', 'ecomsolvebd' );
		}
		switch ( $result['reason'] ?? '' ) {
			case 'ngrok_interstitial':
				return __( 'The API returned an unexpected HTML page instead of JSON. Check that your API base URL is correct and reachable, then try Test connection again.', 'ecomsolvebd' );
			case 'bad_key':
				return __( 'Unknown Merchant ID for this API. Connect your store on EcomSolveBD, copy the Tracking Merchant ID from Integrations → WooCommerce, and paste it here.', 'ecomsolvebd' );
			case 'bad_url':
				return __( 'Enter a valid Merchant ID and save settings.', 'ecomsolvebd' );
			default:
				return __( 'Could not reach the EcomSolveBD API or got a non-JSON response. Confirm your Merchant ID and that https://api.ecomsolvebd.com is reachable, then try again.', 'ecomsolvebd' );
		}
	}

	public static function ajax_test_connection(): void {
		check_ajax_referer( 'ecomso_test_connection', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Forbidden.', 'ecomsolvebd' ) ), 403 );
		}

		$api_base = isset( $_POST['api_base'] )
			? ECOMSO_Enqueue::normalize_api_base( sanitize_text_field( wp_unslash( (string) $_POST['api_base'] ) ) )
			: '';
		if ( $api_base === '' ) {
			$stored = get_option( self::OPT_KEY, array() );
			$merged = class_exists( 'ECOMSO_Config' )
				? ECOMSO_Config::merge_settings( is_array( $stored ) ? $stored : array() )
				: ( is_array( $stored ) ? $stored : array() );
			$api_base = ECOMSO_Enqueue::normalize_api_base( (string) ( $merged['api_base'] ?? '' ) );
		}
		$key = isset( $_POST['merchant_id'] ) ? sanitize_text_field( (string) wp_unslash( $_POST['merchant_id'] ) ) : '';

		$result = self::validate_merchant_id_result( $api_base, $key );
		self::persist_connection_status( $result );

		wp_send_json_success(
			array(
				'ok'      => ! empty( $result['ok'] ),
				'reason'  => $result['reason'],
				'message' => self::connection_status_message( $result ),
			)
		);
	}

	public static function ajax_verify_tracking_dns(): void {
		check_ajax_referer( 'ecomso_verify_tracking_dns', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Forbidden.', 'ecomsolvebd' ) ), 403 );
		}
		if ( ! class_exists( 'ECOMSO_First_Party' ) ) {
			wp_send_json_error( array( 'message' => __( 'First-party module not loaded.', 'ecomsolvebd' ) ), 500 );
		}
		$label = isset( $_POST['tracking_subdomain_label'] )
			? sanitize_text_field( wp_unslash( (string) $_POST['tracking_subdomain_label'] ) )
			: '';
		$hostname = ECOMSO_First_Party::hostname_from_label( $label );
		if ( $hostname === '' && isset( $_POST['tracking_hostname'] ) ) {
			$hostname = ECOMSO_First_Party::normalize_hostname(
				sanitize_text_field( wp_unslash( (string) $_POST['tracking_hostname'] ) )
			);
		}
		$result = ECOMSO_First_Party::verify_dns( $hostname );
		$ok     = ! empty( $result['ok'] ) && $hostname !== '';
		// Persist immediately (Shopify/Next/Laravel parity). UI-only verify left storefront on store_proxy
		// and Clear Cache / reload showed "Not verified" again because options were never written.
		if ( $ok ) {
			self::persist_tracking_hostname_verified( $hostname, $label );
			$result['message'] = __(
				'DNS verified and saved — tracking will use your subdomain. Clear site cache once if pages were cached.',
				'ecomsolvebd'
			);
		}
		wp_send_json_success(
			array(
				'ok'       => $ok,
				'message'  => $result['message'],
				'target'   => $result['target'],
				'hostname' => $hostname,
				'persisted'=> $ok,
			)
		);
	}

	/**
	 * Write verified tracking hostname into ecomso_settings and bust storefront caches.
	 */
	private static function persist_tracking_hostname_verified( string $hostname, string $label_raw = '' ): void {
		if ( ! class_exists( 'ECOMSO_First_Party' ) ) {
			return;
		}
		$hostname = ECOMSO_First_Party::normalize_hostname( $hostname );
		if ( $hostname === '' ) {
			return;
		}
		$stored = get_option( self::OPT_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		if ( class_exists( 'ECOMSO_Config' ) ) {
			$stored = ECOMSO_Config::merge_settings( $stored );
		}
		$label = ECOMSO_First_Party::sanitize_subdomain_label( $label_raw );
		if ( $label === '' ) {
			$label = ECOMSO_First_Party::subdomain_label_from_hostname( $hostname );
		}
		$prev_host = ECOMSO_First_Party::normalize_hostname(
			isset( $stored['tracking_hostname'] ) ? (string) $stored['tracking_hostname'] : ''
		);
		$already   = ! empty( $stored['tracking_hostname_verified'] ) && $prev_host === $hostname;

		$stored['tracking_subdomain_label']   = $label !== '' ? $label : ( $stored['tracking_subdomain_label'] ?? 'example' );
		$stored['tracking_hostname']          = $hostname;
		$stored['tracking_hostname_verified'] = true;
		if ( empty( $stored['first_party_mode'] ) || 'direct' === $stored['first_party_mode'] ) {
			$stored['first_party_mode'] = 'auto';
		}

		update_option( self::OPT_KEY, $stored, false );

		if ( ! $already && class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}
	}

	/** @param mixed $input */
	public static function sanitize($input): array {
		$prev = get_option(self::OPT_KEY, array());
		if (!is_array($input)) {
			return is_array($prev) ? $prev : array();
		}
		$allowed_modes = array( 'auto', 'custom' );
		$mode          = isset( $input['first_party_mode'] ) ? sanitize_key( (string) $input['first_party_mode'] ) : 'auto';
		if ( 'direct' === $mode ) {
			$mode = 'auto';
		}
		if ( ! in_array( $mode, $allowed_modes, true ) ) {
			$mode = 'auto';
		}
		$sub_label = '';
		if ( class_exists( 'ECOMSO_First_Party' ) ) {
			$sub_label = ECOMSO_First_Party::sanitize_subdomain_label(
				isset( $input['tracking_subdomain_label'] ) ? (string) $input['tracking_subdomain_label'] : ''
			);
			if ( $sub_label === '' && isset( $input['tracking_hostname'] ) ) {
				$sub_label = ECOMSO_First_Party::subdomain_label_from_hostname( (string) $input['tracking_hostname'] );
			}
			$new_hostname = ECOMSO_First_Party::hostname_from_label( $sub_label );
		} else {
			$new_hostname = '';
		}
		$prev_hostname = '';
		if ( is_array( $prev ) && isset( $prev['tracking_hostname'] ) ) {
			$prev_hostname = class_exists( 'ECOMSO_First_Party' )
				? ECOMSO_First_Party::normalize_hostname( (string) $prev['tracking_hostname'] )
				: strtolower( trim( (string) $prev['tracking_hostname'] ) );
		}
		$verified = is_array( $prev ) && ! empty( $prev['tracking_hostname_verified'] );
		if ( $new_hostname !== $prev_hostname ) {
			$verified = false;
		}
		// Verified flag may be set by WP DNS verify AJAX or unchanged hostname on save.
		$form_wants_verified = isset( $input['tracking_hostname_verified'] )
			&& (string) $input['tracking_hostname_verified'] === '1';
		if ( $new_hostname !== '' && $form_wants_verified && $new_hostname === $prev_hostname ) {
			$verified = true;
		} elseif ( $new_hostname !== $prev_hostname ) {
			$verified = false;
		}

		$prev_site_key = is_array( $prev ) && isset( $prev['site_key'] ) ? sanitize_text_field( (string) $prev['site_key'] ) : '';
		$prev_batch    = is_array( $prev ) && isset( $prev['batch_flush_ms'] ) ? max( 0, min( 60000, (int) $prev['batch_flush_ms'] ) ) : 5000;
		$prev_api = is_array( $prev ) && isset( $prev['api_base'] ) ? trim( (string) $prev['api_base'] ) : '';
		if ( isset( $input['api_base'] ) ) {
			$raw_api = trim( (string) $input['api_base'] );
		} else {
			$raw_api = $prev_api;
		}
		if ( $raw_api === '' && class_exists( 'ECOMSO_Config' ) ) {
			$raw_api = ECOMSO_Config::default_api_base();
		}
		$next = array(
			'api_base'                   => ECOMSO_Enqueue::normalize_api_base( $raw_api ),
			'merchant_id'                => isset($input['merchant_id']) ? sanitize_text_field((string) $input['merchant_id']) : '',
			'site_key'                   => isset( $input['site_key'] ) ? sanitize_text_field( (string) $input['site_key'] ) : $prev_site_key,
			'batch_flush_ms'             => isset( $input['batch_flush_ms'] ) ? max( 0, min( 60000, (int) $input['batch_flush_ms'] ) ) : $prev_batch,
			'use_master_ingest'          => isset( $input['use_master_ingest'] ) ? ! empty( $input['use_master_ingest'] ) : true,
			'server_precapture_enabled'  => is_array( $prev ) && array_key_exists( 'server_precapture_enabled', $prev )
				? ! empty( $prev['server_precapture_enabled'] )
				: true,
			'first_party_mode'           => $mode,
			'tracking_subdomain_label'   => $sub_label,
			'tracking_hostname'          => $new_hostname,
			'tracking_hostname_verified' => $verified,
		);

		$prev_base = is_array( $prev ) && isset( $prev['api_base'] ) ? ECOMSO_Enqueue::normalize_api_base( (string) $prev['api_base'] ) : '';
		$prev_mid  = is_array( $prev ) && isset( $prev['merchant_id'] ) ? trim( (string) $prev['merchant_id'] ) : '';
		if ( ( $next['api_base'] === '' || $next['merchant_id'] === '' ) && $prev_base !== '' && $prev_mid !== '' ) {
			self::notify_saas_plugin_disconnect( $prev_base, $prev_mid );
		}

		$prev_mode = is_array( $prev ) && isset( $prev['first_party_mode'] ) ? (string) $prev['first_party_mode'] : 'auto';
		$credentials_changed = ( $prev_mid !== $next['merchant_id'] )
			|| ( $prev_base !== $next['api_base'] )
			|| ( $prev_mode !== $next['first_party_mode'] )
			|| ( $prev_hostname !== $next['tracking_hostname'] )
			|| ( ( is_array( $prev ) && ! empty( $prev['tracking_hostname_verified'] ) ) !== ! empty( $next['tracking_hostname_verified'] ) );
		if ( $credentials_changed && class_exists( 'ECOMSO_Cache' ) ) {
			ECOMSO_Cache::bust_storefront();
		}

		// Warn if Merchant ID / API URL look wrong, but still save so the form is not cleared.
		if ( $next['api_base'] !== '' && $next['merchant_id'] !== '' ) {
			$vr = self::validate_merchant_id_result( $next['api_base'], $next['merchant_id'] );
			self::persist_connection_status( $vr );
			if ( ! $vr['ok'] && ! self::$validation_notice_added ) {
				self::$validation_notice_added = true;
				$extra = ( 'bad_key' === ( $vr['reason'] ?? '' ) )
					? ' ' . __( 'Storefront tracking is disabled until you fix the Merchant ID.', 'ecomsolvebd' )
					: ' ' . __( 'Settings were saved anyway.', 'ecomsolvebd' );
				add_settings_error(
					self::OPT_KEY,
					'ecomso_connection_' . $vr['reason'],
					self::connection_status_message( $vr ) . $extra,
					'error'
				);
			} elseif ( $vr['ok'] && ! self::$validation_notice_added ) {
				self::$validation_notice_added = true;
				add_settings_error(
					self::OPT_KEY,
					'ecomso_connection_ok',
					self::connection_status_message( $vr ),
					'success'
				);
			}
		}

		return $next;
	}

	public static function render(): void {
		if (!current_user_can('manage_options')) {
			return;
		}

		settings_errors(self::OPT_KEY);

		$stored = get_option( self::OPT_KEY, array() );
		$opts   = class_exists( 'ECOMSO_Config' )
			? ECOMSO_Config::merge_settings( is_array( $stored ) ? $stored : array() )
			: ( is_array( $stored ) ? $stored : array() );

		// Sync first-party hostname/verified from SaaS when available.
		if ( class_exists( 'ECOMSO_First_Party' ) ) {
			ECOMSO_First_Party::sync_from_saas();
			$stored = get_option( self::OPT_KEY, array() );
			$opts   = class_exists( 'ECOMSO_Config' )
				? ECOMSO_Config::merge_settings( is_array( $stored ) ? $stored : array() )
				: ( is_array( $stored ) ? $stored : array() );
		}

		$store_base         = class_exists( 'ECOMSO_First_Party' ) ? ECOMSO_First_Party::store_base_domain() : '';
		$sub_label          = isset( $opts['tracking_subdomain_label'] ) ? (string) $opts['tracking_subdomain_label'] : '';
		if ( $sub_label === '' && class_exists( 'ECOMSO_First_Party' ) && ! empty( $opts['tracking_hostname'] ) ) {
			$sub_label = ECOMSO_First_Party::subdomain_label_from_hostname( (string) $opts['tracking_hostname'] );
		}
		if ( $sub_label === '' && class_exists( 'ECOMSO_First_Party' ) ) {
			$sub_label = ECOMSO_First_Party::default_subdomain_label();
		}
		$full_tracking_host = ! empty( $opts['tracking_hostname'] )
			? (string) $opts['tracking_hostname']
			: ( class_exists( 'ECOMSO_First_Party' ) ? ECOMSO_First_Party::hostname_from_label( $sub_label ) : '' );
		$dns_verified       = ! empty( $opts['tracking_hostname_verified'] );

		$conn     = self::last_connection_status();
		$conn_ok  = is_array( $conn ) && ! empty( $conn['ok'] );
		$conn_msg = is_array( $conn )
			? self::connection_status_message(
				array(
					'ok'     => $conn_ok,
					'reason' => isset( $conn['reason'] ) ? (string) $conn['reason'] : 'bad_response',
				)
			)
			: '';

		?>
		<div class="wrap ecomso-admin-wrap">
			<h1><?php echo esc_html(get_admin_page_title()); ?></h1>

			<?php /* Connection status updated by Test connection (no persistent banner). */ ?>
			<div id="ecomso-connection-status" class="notice" style="display:none; padding:12px 14px; max-width:960px;" hidden>
				<p style="margin:0;">
					<strong><?php esc_html_e( 'Connection', 'ecomsolvebd' ); ?>:</strong>
					<span id="ecomso-connection-message"><?php echo esc_html( $conn_msg ); ?></span>
				</p>
			</div>

			<form action="options.php" method="post" id="ecomso-settings-form">
				<?php settings_fields('ecomso_settings_group'); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ecomso_merchant_id"><?php esc_html_e('Merchant ID', 'ecomsolvebd'); ?></label></th>
						<td>
							<input type="text" name="ecomso_settings[merchant_id]" id="ecomso_merchant_id" class="regular-text code"
								value="<?php echo esc_attr((string) $opts['merchant_id']); ?>" autocomplete="off" />
							<p class="description">
								<a href="https://ecomsolvebd.com/docs/integrations/woocommerce" target="_blank" rel="noopener noreferrer">
									<?php esc_html_e( 'How to find Merchant ID →', 'ecomsolvebd' ); ?>
								</a>
							</p>
						</td>
					</tr>
				</table>

				<div class="ecomso-card ecomso-card--fp">
					<h2 class="ecomso-card__title"><?php esc_html_e( 'First-party tracking', 'ecomsolvebd' ); ?></h2>
					<p class="ecomso-card__lead">
						<?php
						echo wp_kses(
							__( 'Configure and <strong>Verify DNS</strong> in EcomSolveBD → Integrations → WooCommerce. This plugin syncs status from your dashboard automatically.', 'ecomsolvebd' ),
							array( 'strong' => array() )
						);
						?>
					</p>
					<input type="hidden" name="ecomso_settings[first_party_mode]" value="auto" />
					<input type="hidden" name="ecomso_settings[tracking_subdomain_label]" value="<?php echo esc_attr( $sub_label ); ?>" />
					<input type="hidden" name="ecomso_settings[tracking_hostname]" id="ecomso_tracking_hostname" value="<?php echo esc_attr( $full_tracking_host ); ?>" />
					<input type="hidden" name="ecomso_settings[tracking_hostname_verified]" id="ecomso_tracking_hostname_verified" value="<?php echo esc_attr( $dns_verified ? '1' : '0' ); ?>" />

					<div class="ecomso-dns-panel">
						<p class="ecomso-dns-panel__title"><?php esc_html_e( 'Status (from EcomSolveBD)', 'ecomsolvebd' ); ?></p>
						<?php if ( $full_tracking_host !== '' ) : ?>
							<p class="ecomso-dns-hint" style="margin-top:0;">
								<strong><?php esc_html_e( 'Tracking host', 'ecomsolvebd' ); ?>:</strong>
								<code><?php echo esc_html( $full_tracking_host ); ?></code>
							</p>
						<?php endif; ?>
						<div class="ecomso-dns-footer" style="margin-bottom:0;">
							<span class="ecomso-dns-status-inline <?php echo esc_attr( $dns_verified ? 'is-verified' : 'is-pending' ); ?>">
								<span class="ecomso-dns-status-inline__dot" aria-hidden="true"></span>
								<span><?php echo $dns_verified ? esc_html__( 'DNS verified — subdomain ingest active', 'ecomsolvebd' ) : esc_html__( 'Not verified yet — verify in EcomSolveBD dashboard', 'ecomsolvebd' ); ?></span>
							</span>
							<a class="ecomso-dns-guide-link" href="https://ecomsolvebd.com/dashboard/integrations" target="_blank" rel="noopener noreferrer">
								<?php esc_html_e( 'Open Integrations →', 'ecomsolvebd' ); ?>
							</a>
						</div>
					</div>
				</div>

				<p class="submit" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
					<?php submit_button( __( 'Save settings', 'ecomsolvebd' ), 'primary', 'submit', false ); ?>
					<button type="button" class="button" id="ecomso-test-connection">
						<?php esc_html_e( 'Test connection', 'ecomsolvebd' ); ?>
					</button>
				</p>
			</form>
		</div>
		<?php
	}

	public static function render_feed_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$cards = class_exists( 'ECOMSO_Feed' ) ? ECOMSO_Feed::catalog_feed_cards() : array();
		?>
		<div class="wrap ecomso-feed-wrap">
			<h1><?php esc_html_e( 'Product Feed Generator', 'ecomsolvebd' ); ?></h1>
			<p class="description">
				<?php esc_html_e( 'Public feed URLs for EcomSolveBD, Facebook, TikTok, and Google Merchant — paste each URL where needed. Feeds update live from WooCommerce products.', 'ecomsolvebd' ); ?>
			</p>

			<?php if ( $cards ) : ?>
				<div style="margin-top:16px; max-width:960px;">
					<p style="margin:0 0 10px; font-size:13px; font-weight:600; color:#1d2327;">
						<?php esc_html_e( 'Feed URLs — paste into each platform', 'ecomsolvebd' ); ?>
					</p>
					<div style="display:grid; gap:12px;">
						<?php foreach ( $cards as $card ) : ?>
							<div class="ecomso-feed-card" style="padding:14px 16px; background:#fff; border:1px solid #c3c4c7; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,.04);">
								<div style="display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:8px;">
									<div style="min-width:0;">
										<strong style="font-size:14px; color:#1d2327;"><?php echo esc_html( $card['label'] ); ?></strong>
										<p style="margin:4px 0 0; font-size:12px; color:#646970;"><?php echo esc_html( $card['hint'] ); ?></p>
									</div>
									<a class="button button-small" href="<?php echo esc_url( $card['url'] ); ?>" target="_blank" rel="noopener noreferrer">
										<?php esc_html_e( 'Open', 'ecomsolvebd' ); ?>
									</a>
								</div>
								<div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
									<input type="url" readonly class="large-text code ecomso-feed-url-input" style="flex:1; background:#f6f7f7;"
										value="<?php echo esc_attr( $card['url'] ); ?>"
										aria-label="<?php echo esc_attr( $card['label'] ); ?>" />
									<button type="button" class="button ecomso-copy-feed-url" data-url="<?php echo esc_attr( $card['url'] ); ?>">
										<?php esc_html_e( 'Copy URL', 'ecomsolvebd' ); ?>
									</button>
								</div>
							</div>
						<?php endforeach; ?>
					</div>
					<p class="description" style="margin-top:14px;">
						<?php esc_html_e( 'EcomSolveBD syncs from /feed/products.xml. Meta / TikTok / Google fetch their URLs on their own schedule (hourly recommended). No Save or Fetch needed here.', 'ecomsolvebd' ); ?>
					</p>
				</div>
			<?php endif; ?>
		</div>
		<?php
	}

}
