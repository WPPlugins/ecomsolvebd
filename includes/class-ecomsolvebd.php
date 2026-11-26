<?php
/**
 * Main plugin loader.
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class EcomSolveBD_Tracker {

	/** @var self|null */
	private static $instance = null;

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_init', array( $this, 'register_admin_notices' ) );
		add_filter( 'plugin_action_links_' . ECOMSO_BASENAME, array( $this, 'plugin_action_links' ) );

		if ( class_exists( 'ECOMSO_Rest' ) ) {
			ECOMSO_Rest::init();
		}
		if ( class_exists( 'ECOMSO_Enqueue' ) ) {
			ECOMSO_Enqueue::init();
		}
		if ( class_exists( 'ECOMSO_Admin' ) ) {
			ECOMSO_Admin::init();
		}
		if ( class_exists( 'ECOMSO_GA4' ) ) {
			ECOMSO_GA4::init();
		}
		if ( class_exists( 'ECOMSO_Feed' ) ) {
			ECOMSO_Feed::init();
		}
		if ( class_exists( 'ECOMSO_Server_Precapture' ) ) {
			ECOMSO_Server_Precapture::init();
		}

		add_action( 'plugins_loaded', array( $this, 'bootstrap_woocommerce' ), 20 );
	}

	/**
	 * Plugins list row: Settings link (next to Deactivate).
	 *
	 * @param array<string,string> $links
	 * @return array<string,string>
	 */
	public function plugin_action_links( array $links ): array {
		$url = admin_url( 'admin.php?page=ecomsolvebd' );
		$settings = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'ecomsolvebd' ) . '</a>';
		array_unshift( $links, $settings );
		return $links;
	}

	public function bootstrap_woocommerce(): void {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}
		if ( ! class_exists( 'ECOMSO_WC', false ) ) {
			$wc = ECOMSO_DIR . 'includes/class-ecomso-wc.php';
			if ( is_readable( $wc ) ) {
				require_once $wc;
			}
		}
		if ( class_exists( 'ECOMSO_WC' ) ) {
			ECOMSO_WC::init();
		}
		// Checkout Shield (fraud check + SMS OTP). Inert unless EcomSolveBD turns it on for this store.
		if ( ! class_exists( 'ECOMSO_Checkout_Shield', false ) ) {
			$shield = ECOMSO_DIR . 'includes/class-ecomso-checkout-shield.php';
			if ( is_readable( $shield ) ) {
				require_once $shield;
			}
		}
		if ( class_exists( 'ECOMSO_Checkout_Shield' ) ) {
			ECOMSO_Checkout_Shield::init();
		}
	}

	public function register_admin_notices(): void {
		if ( ! is_admin() || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		$expected = 'ecomsolvebd/ecomsolvebd.php';
		$me       = ECOMSO_BASENAME;

		if ( $me !== $expected ) {
			add_action(
				'admin_notices',
				static function () use ( $me, $expected ) {
					echo '<div class="notice notice-error"><p><strong>EcomSolveBD:</strong> ';
					echo esc_html__(
						'Wrong install folder. Delete this plugin, then upload ecomsolvebd.zip so the path is wp-content/plugins/ecomsolvebd/ecomsolvebd.php',
						'ecomsolvebd'
					);
					echo '<br><code>' . esc_html( $me ) . '</code> ';
					echo esc_html__( '(expected', 'ecomsolvebd' ) . ' <code>' . esc_html( $expected ) . '</code>)</p></div>';
				}
			);
			return;
		}

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$dupes = array();
		foreach ( get_plugins() as $file => $data ) {
			if ( $file === $me ) {
				continue;
			}
			$name = isset( $data['Name'] ) ? (string) $data['Name'] : '';
			if (
				'EcomSolveBD' === $name
				|| 'EcomSolveBD Tracker' === $name
				|| 'FCommerce Tracker' === $name
				|| ( false !== strpos( $file, 'fcommerce-tracker/' ) )
			) {
				$dupes[] = $file;
			}
		}

		if ( ! empty( $dupes ) ) {
			add_action(
				'admin_notices',
				static function () use ( $dupes ) {
					echo '<div class="notice notice-warning"><p><strong>EcomSolveBD:</strong> ';
					esc_html_e( 'Multiple copies detected. Deactivate and delete ALL EcomSolveBD plugins, remove any extra folders under wp-content/plugins/, then install one fresh copy.', 'ecomsolvebd' );
					echo '<br><code>' . esc_html( implode( ', ', $dupes ) ) . '</code></p></div>';
				}
			);
		}
	}
}
