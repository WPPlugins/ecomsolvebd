<?php
/**
 * Product feeds (Shopify ESB parity):
 * - /feed/products.xml  — EcomSolveBD catalog (SaaS sync)
 * - /feed/facebook.xml  — Meta Commerce Manager (g: RSS)
 * - /feed/tiktok.xml    — TikTok Ads catalog (RSS/XML + sku_id)
 * - /feed/google.xml    — Google Merchant Center (g: RSS)
 *
 * @package EcomSolveBD_Tracker
 */

defined( 'ABSPATH' ) || exit;

final class ECOMSO_Feed {

	private const QV = 'ecomso_products_feed';

	/** @var array<string,array{path:string,label:string,hint:string}> */
	public const CHANNELS = array(
		'products' => array(
			'path'  => '/feed/products.xml',
			'label' => 'EcomSolveBD catalog',
			'hint'  => 'SaaS product sync — id/title/price/image/stock for EcomSolveBD catalog.',
		),
		'facebook' => array(
			'path'  => '/feed/facebook.xml',
			'label' => 'Facebook / Instagram Catalog',
			'hint'  => 'Commerce Manager → Use a URL → RSS/XML (g: namespace) — schedule hourly.',
		),
		'tiktok'   => array(
			'path'  => '/feed/tiktok.xml',
			'label' => 'TikTok Catalog',
			'hint'  => 'TikTok Ads Manager → Catalog → Data feed → RSS/XML (g: namespace) — sku_id included.',
		),
		'google'   => array(
			'path'  => '/feed/google.xml',
			'label' => 'Google Merchant Center',
			'hint'  => 'Merchant Center → Feeds → Scheduled fetch — Google RSS/XML.',
		),
	);

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'register_rewrite' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_render_feed' ), 0 );
	}

	public static function register_rewrite(): void {
		add_rewrite_rule( '^feed/products\\.xml$', 'index.php?' . self::QV . '=products', 'top' );
		add_rewrite_rule( '^feed/facebook\\.xml$', 'index.php?' . self::QV . '=facebook', 'top' );
		add_rewrite_rule( '^feed/tiktok\\.xml$', 'index.php?' . self::QV . '=tiktok', 'top' );
		add_rewrite_rule( '^feed/google\\.xml$', 'index.php?' . self::QV . '=google', 'top' );
	}

	/** @param array<int,string> $vars */
	public static function query_vars( array $vars ): array {
		$vars[] = self::QV;
		return $vars;
	}

	/** SaaS catalog sync URL (products.xml). */
	public static function feed_url(): string {
		return self::channel_url( 'products' );
	}

	public static function channel_url( string $channel ): string {
		$channel = sanitize_key( $channel );
		$path    = self::CHANNELS[ $channel ]['path'] ?? self::CHANNELS['products']['path'];
		return home_url( $path );
	}

	/**
	 * Admin cards: EcomSolveBD catalog + Facebook / TikTok / Google.
	 *
	 * @return array<int,array{id:string,label:string,hint:string,url:string,path:string}>
	 */
	public static function catalog_feed_cards(): array {
		$out = array();
		foreach ( array( 'products', 'facebook', 'tiktok', 'google' ) as $id ) {
			if ( ! isset( self::CHANNELS[ $id ] ) ) {
				continue;
			}
			$meta  = self::CHANNELS[ $id ];
			$out[] = array(
				'id'    => $id,
				'label' => $meta['label'],
				'hint'  => $meta['hint'],
				'path'  => $meta['path'],
				'url'   => self::channel_url( $id ),
			);
		}
		return $out;
	}

	public static function maybe_render_feed(): void {
		$channel = (string) get_query_var( self::QV );
		if ( $channel === '' || $channel === '0' ) {
			return;
		}
		/** Legacy rewrite used =1 for products.xml. */
		if ( $channel === '1' ) {
			$channel = 'products';
		}
		$channel = sanitize_key( $channel );
		if ( ! isset( self::CHANNELS[ $channel ] ) ) {
			return;
		}

		if ( ! function_exists( 'wc_get_products' ) ) {
			status_header( 409 );
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo 'WooCommerce is required for products feed.';
			exit;
		}

		$items = self::load_channel_items();
		if ( $channel === 'facebook' || $channel === 'tiktok' ) {
			header( 'Content-Type: application/rss+xml; charset=utf-8' );
		} else {
			header( 'Content-Type: application/xml; charset=utf-8' );
		}
		header( 'Cache-Control: public, max-age=300' );

		if ( $channel === 'products' ) {
			echo self::render_products_catalog_xml(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			exit;
		}
		if ( $channel === 'facebook' ) {
			echo self::to_facebook_rss_xml( $items ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			exit;
		}
		if ( $channel === 'tiktok' ) {
			echo self::to_tiktok_xml( $items ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			exit;
		}
		echo self::to_google_xml( $items ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	/** Original Woo-shaped catalog for EcomSolveBD SaaS sync. */
	private static function render_products_catalog_xml(): string {
		$currency = function_exists( 'get_woocommerce_currency' ) ? (string) get_woocommerce_currency() : '';
		$out      = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
		$out     .= '<products generated_at="' . esc_attr( gmdate( 'c' ) ) . '" currency="' . esc_attr( $currency ) . '">' . "\n";

		$page  = 1;
		$limit = 200;
		while ( true ) {
			$products = wc_get_products(
				array(
					'status' => array( 'publish' ),
					'limit'  => $limit,
					'page'   => $page,
					'return' => 'objects',
				)
			);
			if ( empty( $products ) ) {
				break;
			}

			foreach ( $products as $p ) {
				if ( ! $p instanceof WC_Product ) {
					continue;
				}
				$id           = (string) $p->get_id();
				$title        = (string) $p->get_name();
				$price        = (string) $p->get_price();
				$img          = $p->get_image_id() ? wp_get_attachment_url( $p->get_image_id() ) : '';
				$stock_fields = self::product_stock_fields( $p );
				$terms        = wp_get_post_terms( (int) $p->get_id(), 'product_cat', array( 'fields' => 'names' ) );
				$cat          = ( is_wp_error( $terms ) || empty( $terms ) ) ? '' : implode( ', ', array_map( 'strval', $terms ) );

				$out .= "  <product>\n";
				$out .= '    <id>' . esc_html( $id ) . "</id>\n";
				$out .= '    <title>' . esc_html( $title ) . "</title>\n";
				$out .= '    <price>' . esc_html( $price ) . "</price>\n";
				$out .= '    <currency>' . esc_html( $currency ) . "</currency>\n";
				$out .= '    <category>' . esc_html( $cat ) . "</category>\n";
				$out .= '    <image>' . esc_html( (string) $img ) . "</image>\n";
				$out .= '    <stock>' . esc_html( $stock_fields['status'] ) . "</stock>\n";
				$out .= '    <stock_qty>' . esc_html( $stock_fields['qty'] ) . "</stock_qty>\n";
				$out .= "  </product>\n";
			}

			$page += 1;
		}

		$out .= "</products>\n";
		return $out;
	}

	/**
	 * Channel items for Meta / TikTok / Google (same field shapes as Shopify ESB feeds).
	 *
	 * @return array<int,array{
	 *   id:string,sku_id:string,title:string,description:string,
	 *   availability_meta:string,availability_google:string,price:string,
	 *   link:string,image_link:string,brand:string,product_type:string
	 * }>
	 */
	private static function load_channel_items(): array {
		$currency  = function_exists( 'get_woocommerce_currency' ) ? (string) get_woocommerce_currency() : 'USD';
		$currency  = strtoupper( substr( $currency !== '' ? $currency : 'USD', 0, 3 ) );
		$store_name = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		$brand      = self::xml_safe_text( $store_name !== '' ? $store_name : 'Store', 70 );
		$items      = array();
		$page       = 1;
		$limit      = 200;

		while ( true ) {
			$products = wc_get_products(
				array(
					'status' => array( 'publish' ),
					'limit'  => $limit,
					'page'   => $page,
					'return' => 'objects',
				)
			);
			if ( empty( $products ) ) {
				break;
			}

			foreach ( $products as $p ) {
				if ( ! $p instanceof WC_Product ) {
					continue;
				}

				/** Prefer simple / parent; expand variations when variable. */
				$variants = array( $p );
				if ( $p->is_type( 'variable' ) && method_exists( $p, 'get_children' ) ) {
					$children = array();
					foreach ( (array) $p->get_children() as $vid ) {
						$child = wc_get_product( (int) $vid );
						if ( $child instanceof WC_Product && $child->get_status() === 'publish' ) {
							$children[] = $child;
						}
					}
					if ( $children ) {
						$variants = $children;
					}
				}

				foreach ( $variants as $vp ) {
					$image = $vp->get_image_id() ? (string) wp_get_attachment_url( $vp->get_image_id() ) : '';
					if ( $image === '' && $p->get_image_id() ) {
						$image = (string) wp_get_attachment_url( $p->get_image_id() );
					}
					if ( ! self::is_public_http_image( $image ) ) {
						continue;
					}

					$title = self::strip_html( (string) $vp->get_name() );
					$title = self::xml_safe_text( $title, 150 );
					if ( $title === '' ) {
						continue;
					}

					$price_num = (float) $vp->get_price();
					if ( ! is_finite( $price_num ) || $price_num <= 0 ) {
						continue;
					}

					$id = (string) $vp->get_id();
					$sku = (string) $vp->get_sku();
					if ( $sku === '' ) {
						$sku = $id;
					}

					$terms = wp_get_post_terms( (int) $p->get_id(), 'product_cat', array( 'fields' => 'names' ) );
					$ptype = ( is_wp_error( $terms ) || empty( $terms ) )
						? 'General'
						: self::xml_safe_text( implode( ' > ', array_map( 'strval', $terms ) ), 750 );

					$in_stock = $vp->is_in_stock();
					$link     = (string) $vp->get_permalink();
					if ( $link === '' ) {
						$link = (string) $p->get_permalink();
					}

					$items[] = array(
						'id'                   => self::xml_safe_text( $id, 100 ),
						'sku_id'               => self::xml_safe_text( $sku, 100 ),
						'title'                => $title,
						'description'          => self::xml_safe_text(
							$title . ' — available at ' . $brand,
							5000
						),
						'availability_meta'    => $in_stock ? 'in stock' : 'out of stock',
						'availability_google'  => $in_stock ? 'in_stock' : 'out_of_stock',
						'price'                => number_format( $price_num, 2, '.', '' ) . ' ' . $currency,
						'link'                 => $link,
						'image_link'           => substr( $image, 0, 2000 ),
						'brand'                => $brand,
						'product_type'         => $ptype,
					);
				}
			}

			$page += 1;
		}

		return $items;
	}

	/**
	 * @param array<int,array<string,string>> $items
	 */
	private static function to_facebook_rss_xml( array $items ): string {
		$store_name = self::xml_escape( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ?: 'Store' );
		$origin     = self::xml_escape( home_url( '/' ) );
		$self       = self::xml_escape( self::channel_url( 'facebook' ) );
		$parts      = array(
			'<?xml version="1.0" encoding="utf-8"?>',
			'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:atom="http://www.w3.org/2005/Atom">',
			'<channel>',
			'<title>' . $store_name . ' Product Feed</title>',
			'<description>Product Feed for Facebook</description>',
			'<link>' . $origin . '</link>',
			'<atom:link href="' . $self . '" rel="self" type="application/rss+xml" />',
		);
		foreach ( $items as $it ) {
			$parts[] = '<item>';
			$parts[] = '<g:id>' . self::xml_escape( $it['id'] ) . '</g:id>';
			$parts[] = '<g:title>' . self::xml_escape( $it['title'] ) . '</g:title>';
			$parts[] = '<g:description>' . self::xml_escape( $it['description'] ) . '</g:description>';
			$parts[] = '<g:link>' . self::xml_escape( $it['link'] ) . '</g:link>';
			$parts[] = '<g:image_link>' . self::xml_escape( $it['image_link'] ) . '</g:image_link>';
			$parts[] = '<g:brand>' . self::xml_escape( $it['brand'] ) . '</g:brand>';
			$parts[] = '<g:condition>new</g:condition>';
			$parts[] = '<g:availability>' . self::xml_escape( $it['availability_meta'] ) . '</g:availability>';
			$parts[] = '<g:price>' . self::xml_escape( $it['price'] ) . '</g:price>';
			$parts[] = '<g:product_type>' . self::xml_escape( $it['product_type'] ) . '</g:product_type>';
			$parts[] = '</item>';
		}
		$parts[] = '</channel>';
		$parts[] = '</rss>';
		return implode( "\n", $parts ) . "\n";
	}

	/**
	 * @param array<int,array<string,string>> $items
	 */
	private static function to_tiktok_xml( array $items ): string {
		$store_name = self::xml_escape( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ?: 'Store' );
		$origin     = self::xml_escape( home_url( '/' ) );
		$self       = self::xml_escape( self::channel_url( 'tiktok' ) );
		$parts      = array(
			'<?xml version="1.0" encoding="utf-8"?>',
			'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:atom="http://www.w3.org/2005/Atom">',
			'<channel>',
			'<title>' . $store_name . ' Product Feed</title>',
			'<description>Product Feed for TikTok</description>',
			'<link>' . $origin . '</link>',
			'<atom:link href="' . $self . '" rel="self" type="application/rss+xml" />',
		);
		foreach ( $items as $it ) {
			$sku     = $it['sku_id'] !== '' ? $it['sku_id'] : $it['id'];
			$parts[] = '<item>';
			$parts[] = '<g:id>' . self::xml_escape( $sku ) . '</g:id>';
			$parts[] = '<sku_id>' . self::xml_escape( $sku ) . '</sku_id>';
			$parts[] = '<g:title>' . self::xml_escape( $it['title'] ) . '</g:title>';
			$parts[] = '<g:description>' . self::xml_escape( $it['description'] ) . '</g:description>';
			$parts[] = '<g:link>' . self::xml_escape( $it['link'] ) . '</g:link>';
			$parts[] = '<g:image_link>' . self::xml_escape( $it['image_link'] ) . '</g:image_link>';
			$parts[] = '<g:brand>' . self::xml_escape( $it['brand'] ) . '</g:brand>';
			$parts[] = '<g:condition>new</g:condition>';
			$parts[] = '<g:availability>' . self::xml_escape( $it['availability_meta'] ) . '</g:availability>';
			$parts[] = '<g:price>' . self::xml_escape( $it['price'] ) . '</g:price>';
			$parts[] = '<g:product_type>' . self::xml_escape( $it['product_type'] ) . '</g:product_type>';
			$parts[] = '</item>';
		}
		$parts[] = '</channel>';
		$parts[] = '</rss>';
		return implode( "\n", $parts ) . "\n";
	}

	/**
	 * @param array<int,array<string,string>> $items
	 */
	private static function to_google_xml( array $items ): string {
		$store_name = self::xml_escape( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ?: 'Store' );
		$origin     = self::xml_escape( home_url( '/' ) );
		$parts      = array(
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
			'<channel>',
			'<title>' . $store_name . ' products</title>',
			'<link>' . $origin . '</link>',
			'<description>' . $store_name . ' products</description>',
		);
		foreach ( $items as $it ) {
			$parts[] = '<item>';
			$parts[] = '<g:id>' . self::xml_escape( $it['id'] ) . '</g:id>';
			$parts[] = '<g:title>' . self::xml_escape( $it['title'] ) . '</g:title>';
			$parts[] = '<g:description>' . self::xml_escape( $it['description'] ) . '</g:description>';
			$parts[] = '<g:link>' . self::xml_escape( $it['link'] ) . '</g:link>';
			$parts[] = '<g:image_link>' . self::xml_escape( $it['image_link'] ) . '</g:image_link>';
			$parts[] = '<g:availability>' . $it['availability_google'] . '</g:availability>';
			$parts[] = '<g:condition>new</g:condition>';
			$parts[] = '<g:price>' . self::xml_escape( $it['price'] ) . '</g:price>';
			$parts[] = '<g:brand>' . self::xml_escape( $it['brand'] ) . '</g:brand>';
			$parts[] = '<g:identifier_exists>no</g:identifier_exists>';
			$parts[] = '<g:product_type>' . self::xml_escape( $it['product_type'] ) . '</g:product_type>';
			$parts[] = '</item>';
		}
		$parts[] = '</channel></rss>';
		return implode( "\n", $parts ) . "\n";
	}

	private static function xml_escape( string $value ): string {
		return htmlspecialchars( $value, ENT_XML1 | ENT_QUOTES, 'UTF-8' );
	}

	private static function strip_html( string $input ): string {
		$t = wp_strip_all_tags( $input );
		$t = preg_replace( '/\s+/u', ' ', $t ) ?? $t;
		return trim( $t );
	}

	private static function xml_safe_text( string $input, int $max ): string {
		$t = self::strip_html( $input );
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $t, 0, $max );
		}
		return substr( $t, 0, $max );
	}

	private static function is_public_http_image( string $url ): bool {
		$u = trim( $url );
		if ( ! preg_match( '#^https?://#i', $u ) ) {
			return false;
		}
		if ( stripos( $u, 'data:' ) === 0 || stripos( $u, 'data:image/' ) !== false ) {
			return false;
		}
		return strlen( $u ) <= 2000;
	}

	/**
	 * @param WC_Product $p
	 * @return array{status:string,qty:string}
	 */
	private static function product_stock_fields( $p ): array {
		if ( ! $p->is_in_stock() ) {
			return array(
				'status' => 'out_of_stock',
				'qty'    => '0',
			);
		}
		if ( $p->managing_stock() ) {
			$qty = max( 0, (int) $p->get_stock_quantity() );
			return array(
				'status' => 'in_stock',
				'qty'    => (string) $qty,
			);
		}
		return array(
			'status' => 'in_stock',
			'qty'    => 'unlimited',
		);
	}
}
