<?php
/**
 * WooCommerce hooks — thank-you purchase payload + checkout UX hooks (future courier/RTO server-side).
 *
 * @package EcomSolveBD_Tracker
 */

defined('ABSPATH') || exit;

final class ECOMSO_WC {

	/** @var bool */
	private static $render_injected_cart = false;

	/** @var bool */
	private static $render_injected_product = false;

	/** @var bool */
	private static $inline_product_queued = false;

	/** @var bool */
	private static $inline_cart_queued = false;

	private const ORDER_META_USER_ID        = '_ecomso_user_id';
	private const ORDER_META_SESSION_ID     = '_ecomso_session_id';
	private const ORDER_META_SESSION_NUMBER = '_ecomso_session_number';
	private const ORDER_META_JOURNEY_ID     = '_ecomso_journey_id';
	private const WC_GLOBALS_HANDLE         = 'ecomso-wc-globals';
	private const CHECKOUT_META_HANDLE      = 'ecomso-checkout-meta';

	private static function product_cost( int $product_id ): float {
		if ( ! $product_id || ! class_exists( 'ECOMSO_Product_Cost' ) ) {
			return 0.0;
		}
		return ECOMSO_Product_Cost::item_cost( $product_id );
	}

	private static function product_category_names( int $product_id ): string {
		if ( ! $product_id ) {
			return '';
		}
		$terms = wp_get_post_terms(
			$product_id,
			'product_cat',
			array(
				'fields' => 'names',
			)
		);
		if ( is_wp_error( $terms ) || empty( $terms ) ) {
			return '';
		}
		return implode( ', ', array_map( 'strval', $terms ) );
	}

	/**
	 * Build GA4-style ecommerce item payload.
	 *
	 * @param WC_Product $product
	 * @param int        $quantity
	 * @return array<string,mixed>
	 */
	/**
	 * Unit display price (variable parent → min variation; grouped → cheapest child).
	 */
	private static function product_unit_price( WC_Product $product ): float {
		if ( ! $product instanceof WC_Product ) {
			return 0.0;
		}
		if ( $product->is_type( 'variable' ) ) {
			$min = $product->get_variation_price( 'min', true );
			if ( $min !== '' && $min !== null ) {
				return (float) $min;
			}
			return 0.0;
		}
		if ( $product->is_type( 'grouped' ) ) {
			$lowest = null;
			foreach ( $product->get_children() as $child_id ) {
				$child = wc_get_product( $child_id );
				if ( ! $child instanceof WC_Product || ! $child->is_purchasable() ) {
					continue;
				}
				$p = (float) $child->get_price();
				if ( $p <= 0 ) {
					continue;
				}
				if ( null === $lowest || $p < $lowest ) {
					$lowest = $p;
				}
			}
			return null === $lowest ? 0.0 : (float) $lowest;
		}
		if ( function_exists( 'wc_get_price_to_display' ) ) {
			$disp = wc_get_price_to_display( $product, array( 'qty' => 1 ) );
			if ( is_numeric( $disp ) && (float) $disp > 0 ) {
				return (float) $disp;
			}
		}
		$raw = $product->get_price();
		if ( $raw === '' || null === $raw ) {
			$reg = $product->get_regular_price();
			return (float) ( $reg !== '' && null !== $reg ? $reg : 0 );
		}
		return (float) $raw;
	}

	private static function build_item( WC_Product $product, int $quantity = 1 ): array {
		$pid  = (int) $product->get_id();
		$sku  = (string) ( $product->get_sku() ? $product->get_sku() : $pid );
		$cats = self::product_category_names( $pid );
		$cost = self::product_cost( $pid );

		return array(
			'product_id'    => $pid,
			'item_id'       => $sku,
			'item_name'     => (string) $product->get_name(),
			'item_category' => (string) $cats,
			'price'         => self::product_unit_price( $product ),
			'item_cost'     => (float) $cost,
			'quantity'      => max( 1, $quantity ),
		);
	}

	/** True when ESB front-end scripts may run (merged settings + connection gate). */
	private static function tracking_scripts_enabled(): bool {
		if ( is_admin() ) {
			return false;
		}
		return class_exists( 'ECOMSO_Admin' ) && ECOMSO_Admin::is_storefront_tracking_enabled();
	}

	public static function init(): void {
		add_action( 'woocommerce_thankyou', array( __CLASS__, 'thankyou' ), 10, 1 );
		add_action( 'woocommerce_order_status_processing', array( __CLASS__, 'on_order_status_sync' ), 20, 1 );
		add_action( 'woocommerce_order_status_completed', array( __CLASS__, 'on_order_status_sync' ), 20, 1 );
		add_action('wp_footer', array(__CLASS__, 'thankyou_footer_fallback'), 18);
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_storefront_assets' ), 15 );
		// Early in template so JS always sees globals (Elementor / block themes often break footer-only injection).
		add_action( 'woocommerce_before_single_product_summary', array( __CLASS__, 'queue_inline_product_global' ), 1 );
		add_action( 'woocommerce_before_cart_table', array( __CLASS__, 'queue_inline_cart_global' ), 1 );
		add_action( 'wp_footer', array( __CLASS__, 'queue_inline_checkout_cart_global' ), 5 );
		// Cart blocks only — never prepend scripts into `woocommerce/checkout` (breaks Blocks hydration).
		add_filter( 'render_block', array( __CLASS__, 'inject_globals_render_block' ), 5, 2 );
		add_action( 'wp_footer', array( __CLASS__, 'inject_wc_bridge_globals' ), 19 );
		add_filter( 'woocommerce_loop_add_to_cart_link', array( __CLASS__, 'add_loop_button_data' ), 10, 2 );

		// Hidden-by-default: no menu needed. Works automatically when plugin runs.
		add_action( 'woocommerce_after_checkout_form', array( __CLASS__, 'inject_tracking_hidden_fields' ) );
		add_action( 'woocommerce_checkout_create_order', array( __CLASS__, 'save_tracking_order_meta' ), 10, 2 );
		add_action( 'woocommerce_admin_order_data_after_billing_address', array( __CLASS__, 'render_tracking_meta_admin' ) );

		// GTM4WP-style reliability helpers for ecommerce events.
		add_action( 'woocommerce_after_add_to_cart_button', array( __CLASS__, 'inject_single_add_to_cart_product_data' ) );
		add_filter( 'woocommerce_cart_item_product', array( __CLASS__, 'cart_item_product_filter' ), 10, 3 );
		add_filter( 'woocommerce_cart_item_remove_link', array( __CLASS__, 'cart_item_remove_link_filter' ), 10, 2 );
	}

	/**
	 * Inject product JSON on single product pages (so JS can fire add_to_cart reliably).
	 */
	public static function inject_single_add_to_cart_product_data(): void {
		if ( is_admin() || ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}
		global $product;
		if ( ! $product instanceof WC_Product ) {
			return;
		}
		$item = self::build_item( $product, 1 );
		$json = wp_json_encode( $item );
		printf(
			'<input type="hidden" name="ecomso_product_data" value="%s" />' . "\n",
			esc_attr( (string) $json )
		);
		// span: still resolve product data via closest when icon/text inside the button is clicked
		printf(
			'<span class="ecomso-product-data" hidden data-ecomso-product-data="%s"></span>' . "\n",
			esc_attr( (string) $json )
		);
	}

	/** @var array<string,mixed>|null */
	private static $last_cart_item_product_data = null;

	/**
	 * Capture product data while Woo renders cart rows.
	 *
	 * @param WC_Product $product
	 * @param array      $cart_item
	 * @param string     $cart_item_key
	 */
	public static function cart_item_product_filter( $product, $cart_item = array(), $cart_item_key = '' ) {
		if ( $product instanceof WC_Product ) {
			$qty = isset( $cart_item['quantity'] ) ? (int) $cart_item['quantity'] : 1;
			self::$last_cart_item_product_data = self::build_item( $product, $qty );
		}
		return $product;
	}

	/**
	 * Enrich cart remove link with product JSON so JS can emit remove_from_cart with full ecommerce payload.
	 *
	 * @param string $remove_from_cart_link
	 * @param string $cart_item_key
	 */
	public static function cart_item_remove_link_filter( string $remove_from_cart_link, string $cart_item_key ): string {
		if ( ! is_array( self::$last_cart_item_product_data ) || empty( self::$last_cart_item_product_data ) ) {
			return $remove_from_cart_link;
		}
		$payload = esc_attr( wp_json_encode( self::$last_cart_item_product_data ) );
		self::$last_cart_item_product_data = null;
		return preg_replace( '/<a\s/i', '<a data-ecomso-product-data="' . $payload . '" ', $remove_from_cart_link, 1 ) ?: $remove_from_cart_link;
	}

	/**
	 * Step 1: inject hidden fields on checkout to persist tracker identity.
	 * Runs only on checkout page and prints no UI.
	 */
	public static function inject_tracking_hidden_fields(): void {
		if ( is_admin() || ! self::is_checkout_context() || ! self::tracking_scripts_enabled() ) {
			return;
		}
		if ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) {
			return;
		}
		self::ensure_checkout_meta_script();
	}

	/** Register storefront helpers via wp_enqueue_script (Plugin Check). */
	public static function register_storefront_assets(): void {
		if ( is_admin() || ! self::tracking_scripts_enabled() ) {
			return;
		}
		if (
			! self::is_product_context()
			&& ! self::is_cart_context()
			&& ! self::is_checkout_context()
		) {
			return;
		}

		wp_register_script( self::WC_GLOBALS_HANDLE, false, array(), ECOMSO_VERSION, false );
		wp_enqueue_script( self::WC_GLOBALS_HANDLE );

		if ( self::is_checkout_context() ) {
			self::ensure_checkout_meta_script();
		}
	}

	private static function ensure_wc_globals_script(): void {
		if ( ! wp_script_is( self::WC_GLOBALS_HANDLE, 'registered' ) ) {
			wp_register_script( self::WC_GLOBALS_HANDLE, false, array(), ECOMSO_VERSION, false );
		}
		if ( ! wp_script_is( self::WC_GLOBALS_HANDLE, 'enqueued' ) ) {
			wp_enqueue_script( self::WC_GLOBALS_HANDLE );
		}
	}

	private static function ensure_checkout_meta_script(): void {
		if ( ! wp_script_is( self::CHECKOUT_META_HANDLE, 'registered' ) ) {
			wp_register_script(
				self::CHECKOUT_META_HANDLE,
				ECOMSO_URL . 'assets/js/ecomso-checkout-meta.js',
				array(),
				ECOMSO_VERSION,
				true
			);
		}
		if ( ! wp_script_is( self::CHECKOUT_META_HANDLE, 'enqueued' ) ) {
			wp_enqueue_script( self::CHECKOUT_META_HANDLE );
		}
	}

	private static function queue_product_global_inline(): void {
		if ( self::$inline_product_queued ) {
			return;
		}
		$p = self::build_product_page_payload();
		if ( ! is_array( $p ) ) {
			return;
		}
		self::ensure_wc_globals_script();
		wp_add_inline_script(
			self::WC_GLOBALS_HANDLE,
			'window.__ECOMSO_PRODUCT__=' . wp_json_encode( $p ) . ';',
			'before'
		);
		self::$inline_product_queued = true;
	}

	private static function queue_cart_global_inline(): void {
		if ( self::$inline_cart_queued ) {
			return;
		}
		$c = self::build_cart_payload();
		if ( ! is_array( $c ) || empty( $c['items'] ) ) {
			return;
		}
		self::ensure_wc_globals_script();
		wp_add_inline_script(
			self::WC_GLOBALS_HANDLE,
			'window.__ECOMSO_CART__=' . wp_json_encode( $c ) . ';',
			'before'
		);
		self::$inline_cart_queued = true;
	}

	/** Whether a WooCommerce product may be exposed on public storefront APIs. */
	public static function is_product_publicly_viewable( int $product_id ): bool {
		if ( $product_id <= 0 ) {
			return false;
		}
		$post = get_post( $product_id );
		if ( ! $post instanceof WP_Post || 'product' !== $post->post_type ) {
			return false;
		}
		if ( ! is_post_publicly_viewable( $post ) ) {
			return false;
		}
		if ( ! function_exists( 'wc_get_product' ) ) {
			return false;
		}
		$product = wc_get_product( $product_id );
		return $product instanceof WC_Product && $product->is_visible();
	}

	/**
	 * Step 2: save identity fields into order meta.
	 *
	 * @param WC_Order $order
	 * @param array    $data
	 */
	public static function save_tracking_order_meta( $order, $data ): void {
		if ( ! $order instanceof WC_Order ) {
			return;
		}
		// phpcs:disable WordPress.Security.NonceVerification.Missing
		$user_id        = isset( $_POST['ecomso_user_id'] ) ? sanitize_text_field( (string) wp_unslash( $_POST['ecomso_user_id'] ) ) : '';
		$session_id     = isset( $_POST['ecomso_session_id'] ) ? sanitize_text_field( (string) wp_unslash( $_POST['ecomso_session_id'] ) ) : '';
		$session_number = isset( $_POST['ecomso_session_number'] ) ? sanitize_text_field( (string) wp_unslash( $_POST['ecomso_session_number'] ) ) : '';
		$journey_id     = isset( $_POST['ecomso_journey_id'] ) ? sanitize_text_field( (string) wp_unslash( $_POST['ecomso_journey_id'] ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Missing

		if ( $user_id !== '' ) {
			$order->update_meta_data( self::ORDER_META_USER_ID, $user_id );
		}
		if ( $session_id !== '' ) {
			$order->update_meta_data( self::ORDER_META_SESSION_ID, $session_id );
		}
		if ( $session_number !== '' ) {
			$order->update_meta_data( self::ORDER_META_SESSION_NUMBER, $session_number );
		}
		if ( $journey_id !== '' ) {
			$order->update_meta_data( self::ORDER_META_JOURNEY_ID, $journey_id );
		}
	}

	/**
	 * Step 3: show meta on WooCommerce admin order page.
	 *
	 * @param WC_Order $order
	 */
	public static function render_tracking_meta_admin( $order ): void {
		if ( ! $order instanceof WC_Order ) {
			return;
		}
		$user_id        = (string) $order->get_meta( self::ORDER_META_USER_ID );
		$session_id     = (string) $order->get_meta( self::ORDER_META_SESSION_ID );
		$session_number = (string) $order->get_meta( self::ORDER_META_SESSION_NUMBER );
		$journey_id     = (string) $order->get_meta( self::ORDER_META_JOURNEY_ID );

		if ( $user_id === '' && $session_id === '' && $session_number === '' && $journey_id === '' ) {
			return;
		}
		?>
		<div style="margin-top:20px;">
			<h3><?php echo esc_html__( 'ESB Tracking Data', 'ecomsolvebd' ); ?></h3>
			<?php if ( $user_id !== '' ) : ?>
				<p><strong><?php echo esc_html__( 'ESB User ID', 'ecomsolvebd' ); ?>:</strong> <?php echo esc_html( $user_id ); ?></p>
			<?php endif; ?>
			<?php if ( $session_id !== '' ) : ?>
				<p><strong><?php echo esc_html__( 'ESB Session ID', 'ecomsolvebd' ); ?>:</strong> <?php echo esc_html( $session_id ); ?></p>
			<?php endif; ?>
			<?php if ( $session_number !== '' ) : ?>
				<p><strong><?php echo esc_html__( 'ESB Session Number', 'ecomsolvebd' ); ?>:</strong> <?php echo esc_html( $session_number ); ?></p>
			<?php endif; ?>
			<?php if ( $journey_id !== '' ) : ?>
				<p><strong><?php echo esc_html__( 'ESB Journey ID', 'ecomsolvebd' ); ?>:</strong> <?php echo esc_html( $journey_id ); ?></p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Enrich add-to-cart buttons on archive pages so JS can send ecommerce data.
	 *
	 * @param string     $html
	 * @param WC_Product $product
	 */
	public static function add_loop_button_data( string $html, $product ): string {
		if ( ! $product instanceof WC_Product ) {
			return $html;
		}
		$item = self::build_item( $product, 1 );
		$attrs = array(
			'data-ecomso-product-data' => wp_json_encode( $item ),
			'data-ecomso-currency'     => (string) get_woocommerce_currency(),
		);

		// Insert attributes into the first <a ...> tag.
		$insert = '';
		foreach ( $attrs as $k => $v ) {
			$insert .= ' ' . $k . '="' . esc_attr( $v ) . '"';
		}
		return preg_replace( '/<a\s/i', '<a' . $insert . ' ', $html, 1 ) ?: $html;
	}

	/**
	 * True when this response is the WooCommerce cart page (classic or WC-assigned page).
	 */
	private static function is_cart_context(): bool {
		if ( function_exists( 'is_cart' ) && is_cart() ) {
			return true;
		}
		if ( function_exists( 'wc_get_page_id' ) && function_exists( 'is_page' ) ) {
			$pid = (int) wc_get_page_id( 'cart' );
			return $pid > 0 && is_page( $pid );
		}
		return false;
	}

	/**
	 * FunnelKit Checkout / CartFlows / CheckoutWC / Funnel Builder — often not is_checkout().
	 */
	public static function is_custom_checkout_context(): bool {
		if ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) {
			return false;
		}

		$fns = array(
			'wfacp_is_checkout',
			'wfacp_is_checkout_page',
			'_is_wcf_checkout_type',
			'wcf_is_checkout_type',
			'cfw_is_checkout',
		);
		foreach ( $fns as $fn ) {
			if ( function_exists( $fn ) && $fn() ) {
				return true;
			}
		}

		if ( function_exists( 'is_singular' ) ) {
			if ( is_singular( 'wfacp_checkout' ) ) {
				return true;
			}
			if ( is_singular( 'cartflows_step' ) ) {
				$step_id = (int) get_queried_object_id();
				$step    = $step_id > 0 ? (string) get_post_meta( $step_id, 'wcf-step-type', true ) : '';
				if ( $step === 'checkout' ) {
					return true;
				}
			}
		}

		if ( function_exists( 'get_body_class' ) ) {
			$classes = get_body_class();
			$needles = array(
				'wfacp_checkout_page',
				'wfacp-template',
				'wfacp_default_template',
				'cartflows-checkout',
				'wcf-checkout',
				'checkout-wc',
				'cfw-checkout',
				'fk-checkout',
			);
			foreach ( $needles as $needle ) {
				if ( in_array( $needle, $classes, true ) ) {
					return true;
				}
			}
			foreach ( $classes as $class ) {
				$c = strtolower( (string) $class );
				if ( strpos( $c, 'wfacp' ) !== false && strpos( $c, 'checkout' ) !== false ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * True when this response is checkout (not order-received).
	 */
	public static function is_checkout_context(): bool {
		if ( function_exists( 'is_order_received_page' ) && is_order_received_page() ) {
			return false;
		}
		if ( function_exists( 'is_checkout' ) && is_checkout() ) {
			return true;
		}
		if ( function_exists( 'wc_get_page_id' ) && function_exists( 'is_page' ) ) {
			$pid = (int) wc_get_page_id( 'checkout' );
			if ( $pid > 0 && is_page( $pid ) ) {
				return true;
			}
		}
		return self::is_custom_checkout_context();
	}

	/**
	 * True on single product templates (covers many Elementor / builder cases where is_product() is unreliable).
	 */
	private static function is_product_context(): bool {
		if ( function_exists( 'is_product' ) && is_product() ) {
			return true;
		}
		return function_exists( 'is_singular' ) && is_singular( 'product' );
	}

	/**
	 * Resolve main product for view_item (prefer queried object over global $product — global is often unset in footer/builders).
	 */
	private static function resolve_view_item_product(): ?WC_Product {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return null;
		}
		if ( function_exists( 'is_singular' ) && is_singular( 'product' ) ) {
			$qid = (int) get_queried_object_id();
			if ( $qid > 0 ) {
				$p = wc_get_product( $qid );
				if ( $p instanceof WC_Product ) {
					return $p;
				}
			}
		}
		global $product;
		if ( $product instanceof WC_Product ) {
			return $product;
		}
		return null;
	}

	public static function queue_inline_product_global(): void {
		if ( is_admin() || ! self::tracking_scripts_enabled() || ! self::is_product_context() ) {
			return;
		}
		self::queue_product_global_inline();
	}

	/**
	 * WooCommerce Cart / Checkout Blocks: queue cart JSON so `ecomso-wc-bridge.js` sees `window.__ECOMSO_CART__`.
	 *
	 * @param string                                $block_content
	 * @param array<string,mixed>|WP_Block_Parser_Block $block
	 */
	public static function inject_globals_render_block( $block_content, $block ) {
		if ( is_admin() || ! self::tracking_scripts_enabled() ) {
			return $block_content;
		}
		$name = '';
		if ( is_array( $block ) && isset( $block['blockName'] ) ) {
			$name = (string) $block['blockName'];
		} elseif ( is_object( $block ) && isset( $block->name ) ) {
			$name = (string) $block->name;
		}
		if ( $name === '' ) {
			return $block_content;
		}

		$cartish = in_array(
			$name,
			array(
				'woocommerce/cart',
				'woocommerce/filled-cart-block',
				'woocommerce/empty-cart-block',
			),
			true
		);
		$productish = ( $name === 'woocommerce/single-product' );

		if ( ! $cartish && ! $productish ) {
			return $block_content;
		}

		if ( $productish && self::is_product_context() && ! self::$render_injected_product ) {
			self::queue_product_global_inline();
			self::$render_injected_product = self::$inline_product_queued;
		}

		if ( $cartish && ! self::is_cart_context() ) {
			return $block_content;
		}

		if ( self::$render_injected_cart ) {
			return $block_content;
		}

		self::queue_cart_global_inline();
		self::$render_injected_cart = self::$inline_cart_queued;

		return $block_content;
	}

	public static function queue_inline_cart_global(): void {
		if ( is_admin() || ! self::tracking_scripts_enabled() || ! self::is_cart_context() ) {
			return;
		}
		self::queue_cart_global_inline();
	}

	/** Checkout blocks skip render_block injection — footer snapshot when PHP runs. */
	public static function queue_inline_checkout_cart_global(): void {
		if ( is_admin() || ! self::tracking_scripts_enabled() || ! self::is_checkout_context() ) {
			return;
		}
		self::queue_cart_global_inline();
	}

	/**
	 * Live product ecommerce (REST / cache-safe JS) — does not use WooCommerce Store API.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function product_ecommerce_for_id( int $product_id ): ?array {
		if ( $product_id <= 0 || ! function_exists( 'wc_get_product' ) ) {
			return null;
		}
		if ( ! self::is_product_publicly_viewable( $product_id ) ) {
			return null;
		}
		$product = wc_get_product( $product_id );
		if ( ! $product instanceof WC_Product ) {
			return null;
		}
		return self::ecommerce_from_product( $product );
	}

	/**
	 * Live cart ecommerce (REST) — session-aware PHP cart, not page-cached HTML.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function cart_ecommerce_payload(): ?array {
		self::ensure_cart_session_loaded();
		return self::build_cart_payload();
	}

	/** Load Woo session cart for REST / tracker-config (guest checkout + cache-safe JS). */
	public static function ensure_cart_session_loaded(): void {
		if ( ! function_exists( 'WC' ) ) {
			return;
		}
		if ( ! did_action( 'woocommerce_init' ) ) {
			WC();
		}
		if ( function_exists( 'wc_load_cart' ) ) {
			wc_load_cart();
		}
		$cart = WC()->cart;
		if ( $cart && method_exists( $cart, 'get_cart' ) ) {
			$cart->get_cart();
			if ( method_exists( $cart, 'calculate_totals' ) ) {
				$cart->calculate_totals();
			}
		}
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function ecommerce_from_product( WC_Product $product ): ?array {
		$brand = '';
		if ( taxonomy_exists( 'product_brand' ) ) {
			$terms = get_the_terms( $product->get_id(), 'product_brand' );
			if ( is_array( $terms ) && ! empty( $terms ) ) {
				$brand = (string) $terms[0]->name;
			}
		}
		$cats = self::product_category_names( $product->get_id() );
		$cost  = self::product_cost( $product->get_id() );
		$price = self::product_unit_price( $product );
		return array(
			'currency' => get_woocommerce_currency(),
			'value'    => $price,
			'items'    => array(
				array(
					'product_id'    => (int) $product->get_id(),
					'item_id'       => (string) ( $product->get_sku() ? $product->get_sku() : $product->get_id() ),
					'item_name'     => (string) $product->get_name(),
					'item_brand'    => (string) $brand,
					'item_category' => (string) $cats,
					'price'         => $price,
					'item_cost'     => (float) $cost,
					'quantity'      => 1,
				),
			),
		);
	}

	/**
	 * Build view_item payload for current single product (main query).
	 *
	 * @return array<string,mixed>|null
	 */
	private static function build_product_page_payload(): ?array {
		if ( ! self::is_product_context() ) {
			return null;
		}
		$product = self::resolve_view_item_product();
		if ( ! $product instanceof WC_Product ) {
			return null;
		}
		return self::ecommerce_from_product( $product );
	}

	/**
	 * Build cart payload for view_cart / begin_checkout (items + summed value).
	 *
	 * @return array<string,mixed>|null
	 */
	private static function build_cart_payload(): ?array {
		if ( ! function_exists( 'WC' ) ) {
			return null;
		}
		self::ensure_cart_session_loaded();
		$cart = WC()->cart;
		if ( ! $cart ) {
			return null;
		}
		if ( method_exists( $cart, 'calculate_totals' ) ) {
			$cart->calculate_totals();
		}
		$items = array();
		$total = 0.0;
		foreach ( $cart->get_cart() as $cart_item_key => $line ) {
			if ( empty( $line['data'] ) || ! ( $line['data'] instanceof WC_Product ) ) {
				continue;
			}
			$p = $line['data'];
			$qty  = isset( $line['quantity'] ) ? (int) $line['quantity'] : 1;
			$item = self::build_item( $p, $qty );
			$items[] = $item;
			$total += (float) $item['price'] * (int) $item['quantity'];
		}
		return array(
			'currency' => get_woocommerce_currency(),
			'value'    => (float) $total,
			'items'    => $items,
		);
	}

	/**
	 * Inject window.__ECOMSO_PRODUCT__ / window.__ECOMSO_CART__ immediately BEFORE ecomso-wc-bridge.js (fixes race vs loose footer echoes).
	 */
	public static function inject_wc_bridge_globals(): void {
		if ( is_admin() || ! self::tracking_scripts_enabled() ) {
			return;
		}
		if ( ! function_exists( 'WC' ) ) {
			return;
		}

		$is_product  = self::is_product_context();
		$is_cart     = self::is_cart_context();
		$is_checkout = self::is_checkout_context();

		if ( ! $is_product && ! $is_cart && ! $is_checkout ) {
			return;
		}

		if ( $is_product && ! self::$inline_product_queued ) {
			self::queue_product_global_inline();
		}
		if ( ( $is_cart || $is_checkout ) && ! self::$inline_cart_queued ) {
			self::queue_cart_global_inline();
		}
	}

	/** @deprecated Browser fallback — server-side sync runs on thank-you / order status. */
	public static function thankyou_footer_fallback(): void {
	}

	/**
	 * Push order to SaaS via REST (WooCommerce → EcomSolveBD Orders list + purchase event).
	 *
	 * @param int|string $order_id Woo order id.
	 */
	public static function thankyou( $order_id ): void {
		self::sync_order_to_saas( absint( $order_id ) );
	}

	/**
	 * @param int|string $order_id Woo order id.
	 */
	public static function on_order_status_sync( $order_id ): void {
		self::sync_order_to_saas( absint( $order_id ) );
	}

	/**
	 * POST /v1/tracking/sync-woocommerce-order — debounced per order.
	 *
	 * @param int $order_id Woo order id.
	 */
	private static function sync_order_to_saas( int $order_id ): void {
		if ( $order_id <= 0 || ! class_exists( 'ECOMSO_Admin' ) || ! class_exists( 'ECOMSO_Enqueue' ) ) {
			return;
		}
		if ( ! ECOMSO_Admin::has_tracker_credentials() ) {
			return;
		}

		$lock_key = 'ecomso_sync_order_' . $order_id;
		if ( get_transient( $lock_key ) ) {
			return;
		}
		set_transient( $lock_key, '1', 60 );

		$stored = get_option( 'ecomso_settings', array() );
		$merged = class_exists( 'ECOMSO_Config' ) && is_array( $stored )
			? ECOMSO_Config::merge_settings( $stored )
			: ( is_array( $stored ) ? $stored : array() );
		$api    = ECOMSO_Enqueue::normalize_api_base( (string) ( $merged['api_base'] ?? '' ) );
		$mid    = trim( (string) ( $merged['merchant_id'] ?? '' ) );
		if ( $api === '' || $mid === '' ) {
			return;
		}

		$url  = $api . '/v1/tracking/sync-woocommerce-order';
		$args = array(
			'timeout' => 20,
			'method'  => 'POST',
			'headers' => array(
				'Content-Type'   => 'application/json',
				'Accept'         => 'application/json',
				'x-merchant-key' => $mid,
			),
			'body'    => wp_json_encode(
				array(
					'order_id' => $order_id,
				)
			),
		);
		if ( class_exists( 'ECOMSO_Http' ) ) {
			$args = ECOMSO_Http::remote_args( $args, $url );
		}
		wp_remote_post( add_query_arg( 'key', rawurlencode( $mid ), $url ), $args );
	}
}
