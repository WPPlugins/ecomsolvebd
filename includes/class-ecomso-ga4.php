<?php
/**
 * Google Analytics 4 — Measurement ID settings + standard gtag.js loader only.
 *
 * Loads GA4’s default automatic events (page_view, etc.). Does not send
 * ecommerce or mirrored SaaS events. EcomSolveBD SaaS tracking is unchanged.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_GA4 {

	private const OPT_KEY      = 'ecomso_ga4_settings';
	private const SETTINGS_GRP = 'ecomso_ga4_settings_group';
	private const MENU_SLUG    = 'ecomso-ga4';

	/** @var bool */
	private static $gtag_printed = false;

	public static function init(): void {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ), 11 );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_gtag' ), 5 );
		add_filter( 'script_loader_tag', array( __CLASS__, 'async_gtag_tag' ), 10, 2 );
	}

	/**
	 * Submenu under EcomSolveBD Tracker (sibling to Settings).
	 */
	public static function menu(): void {
		add_submenu_page(
			'ecomsolvebd',
			__( 'Google Analytics 4', 'ecomsolvebd' ),
			__( 'Google Analytics 4', 'ecomsolvebd' ),
			'manage_options',
			self::MENU_SLUG,
			array( __CLASS__, 'render_page' )
		);
	}

	public static function register(): void {
		register_setting(
			self::SETTINGS_GRP,
			self::OPT_KEY,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
				'default'           => array(
					'measurement_id' => '',
				),
			)
		);
	}

	/**
	 * @param mixed $input Raw option value.
	 * @return array{measurement_id:string}
	 */
	public static function sanitize_settings( $input ): array {
		$prev = get_option( self::OPT_KEY, array() );
		if ( ! is_array( $prev ) ) {
			$prev = array();
		}

		$raw = is_array( $input ) && isset( $input['measurement_id'] )
			? (string) $input['measurement_id']
			: '';

		$id = self::normalize_measurement_id( $raw );

		if ( $raw !== '' && $id === '' ) {
			add_settings_error(
				self::OPT_KEY,
				'ecomso_ga4_invalid_measurement_id',
				__( 'GA4 Measurement ID must look like G-XXXXXXXXXX (letters and numbers after G-).', 'ecomsolvebd' ),
				'error'
			);
			return array(
				'measurement_id' => isset( $prev['measurement_id'] ) ? self::normalize_measurement_id( (string) $prev['measurement_id'] ) : '',
			);
		}

		add_settings_error(
			self::OPT_KEY,
			'ecomso_ga4_settings_saved',
			__( 'Settings saved.', 'ecomsolvebd' ),
			'success'
		);

		return array(
			'measurement_id' => $id,
		);
	}

	public static function normalize_measurement_id( string $raw ): string {
		$t = strtoupper( trim( $raw ) );
		if ( $t === '' ) {
			return '';
		}
		if ( preg_match( '/^G-[A-Z0-9]{4,32}$/', $t ) ) {
			return $t;
		}
		return '';
	}

	public static function measurement_id(): string {
		$opts = get_option( self::OPT_KEY, array() );
		if ( ! is_array( $opts ) || empty( $opts['measurement_id'] ) ) {
			return '';
		}
		return self::normalize_measurement_id( (string) $opts['measurement_id'] );
	}

	public static function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$opts = wp_parse_args(
			get_option( self::OPT_KEY, array() ),
			array(
				'measurement_id' => '',
			)
		);
		$mid = isset( $opts['measurement_id'] ) ? (string) $opts['measurement_id'] : '';
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<?php settings_errors( self::OPT_KEY ); ?>
			<p class="description">
				<?php esc_html_e( 'Loads the standard Google tag (gtag.js). Only GA4 automatic events (page_view, etc.) are collected — no ecommerce events from this plugin.', 'ecomsolvebd' ); ?>
			</p>

			<form action="options.php" method="post" id="ecomso-ga4-settings-form">
				<?php settings_fields( self::SETTINGS_GRP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">
							<label for="ecomso_ga4_measurement_id"><?php esc_html_e( 'GA4 Measurement ID', 'ecomsolvebd' ); ?></label>
						</th>
						<td>
							<input
								type="text"
								name="<?php echo esc_attr( self::OPT_KEY ); ?>[measurement_id]"
								id="ecomso_ga4_measurement_id"
								class="regular-text code"
								spellcheck="false"
								autocomplete="off"
								placeholder="G-XXXXXXXXXX"
								value="<?php echo esc_attr( $mid ); ?>"
							/>
							<p class="description" style="margin-top:8px;">
								<a href="https://ecomsolvebd.com/docs/integrations/ga4/measurement-id-api-secret" target="_blank" rel="noopener noreferrer">
									<?php esc_html_e( 'Where to find Measurement ID & API Secret — view guide →', 'ecomsolvebd' ); ?>
								</a>
							</p>
						</td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'ecomsolvebd' ) ); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * Standard Google tag (gtag.js) when a Measurement ID is saved.
	 * Registered via wp_enqueue_script for Plugin Check compliance.
	 */
	public static function enqueue_gtag(): void {
		if ( is_admin() || self::$gtag_printed ) {
			return;
		}

		$mid = self::measurement_id();
		if ( $mid === '' ) {
			return;
		}

		self::$gtag_printed = true;
		$src                = 'https://www.googletagmanager.com/gtag/js?id=' . rawurlencode( $mid );
		wp_register_script( 'ecomso-gtag', $src, array(), ECOMSO_VERSION, false );
		wp_enqueue_script( 'ecomso-gtag' );
		wp_add_inline_script(
			'ecomso-gtag',
			"window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', " . wp_json_encode( $mid ) . ');',
			'after'
		);
	}

	/**
	 * @param string $tag
	 * @param string $handle
	 * @return string
	 */
	public static function async_gtag_tag( $tag, $handle ) {
		if ( 'ecomso-gtag' !== $handle ) {
			return $tag;
		}
		if ( false === strpos( $tag, ' async' ) ) {
			$tag = str_replace( ' src', ' async src', $tag );
		}
		return $tag;
	}
}
