<?php
/**
 * Plugin Name: PeepSo Core: Location
 * Plugin URI: https://peepso.com
 * Description: Share your location when posting a status
 * Author: PeepSo
 * Author URI: https://peepso.com
 * Version: 1.8.2
 * Copyright: (c) 2015 PeepSo LLP. All Rights Reserved.
 * License: GPLv2 or later
 * License URI: http://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: peepso-location
 * Domain Path: /language
 *
 * We are Open Source. You can redistribute and/or modify this software under the terms of the GNU General Public License (version 2 or later)
 * as published by the Free Software Foundation. See the GNU General Public License or the LICENSE file for more details.
 * This software is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY.
 */

class PeepSoLocation
{
	private static $_instance = NULL;

	const PLUGIN_VERSION = '1.8.2';
	const PLUGIN_RELEASE = ''; //ALPHA1, BETA1, RC1, '' for STABLE
	const SHORTCODE_TAG = 'peepso_geo';
    const PLUGIN_NAME = 'LocSo';
    const PLUGIN_SLUG = 'locso';
	const PEEPSOCOM_LICENSES = 'http://tiny.cc/peepso-licenses';

	const PLUGIN_DEV = FALSE;

	/**
	 * Initialize all variables, filters and actions
	 */
	private function __construct()
	{
		if (is_admin()) {
            add_action('admin_init', array(&$this, 'peepso_check'));
        }

		add_action('plugins_loaded', array(&$this, 'load_textdomain'));
		add_action('peepso_init', array(&$this, 'init'));

		add_filter('peepso_admin_profile_field_types', array(&$this, 'admin_profile_field_types'));

		add_filter('peepso_all_plugins', array($this, 'filter_all_plugins'));

		register_activation_hook(__FILE__, array(&$this, 'activate'));
	}

	/**
	 * Retrieve singleton class instance
	 * @return instance reference to plugin
	 */
	public static function get_instance()
	{
		if (NULL === self::$_instance)
			self::$_instance = new self();
		return (self::$_instance);
	}

	/**
	 * Loads the translation file for the PeepSo plugin
	 */
	public function load_textdomain()
	{
		$path = str_ireplace(WP_PLUGIN_DIR, '', dirname(__FILE__)) . DIRECTORY_SEPARATOR . 'language' . DIRECTORY_SEPARATOR;
		load_plugin_textdomain('peepso-location', FALSE, $path);
	}

	/*
	 * Callback for 'peepso_init' action; initialize the PeepSoLocation plugin
	 */
	public function init()
	{
		// set up autoloading
		PeepSo::add_autoload_directory(dirname(__FILE__) . DIRECTORY_SEPARATOR . 'classes' . DIRECTORY_SEPARATOR);
		PeepSoTemplate::add_template_directory(plugin_dir_path(__FILE__));

		if (is_admin()) {
			// display configuration options for admin
			add_filter('peepso_admin_register_config_group-advanced', array(&$this, 'register_config_options'));

			if(!strlen(PeepSo::get_option('location_gmap_api_key'))) {
				add_action('admin_notices', array(&$this, 'api_key_missing_notice'));
			}

		} else {
			add_action('wp_enqueue_scripts', array(&$this, 'enqueue_scripts'));

			// PeepSo postbox
			add_filter('peepso_postbox_interactions', array(&$this, 'postbox_interactions'), 30, 1);
			add_filter('peepso_activity_allow_empty_content', array(&$this, 'activity_allow_empty_content'), 10, 1);

			// Attach post extras
			add_action('wp_insert_post', array(&$this, 'insert_post'), 30, 2);
			add_action('peepso_activity_after_save_post', array(&$this, 'insert_post'), 30, 2);

			// Print post extras
			add_filter('peepso_post_extras', array(&$this, 'filter_post_extras'), 20, 1);
			add_filter('peepso_activity_post_edit', array(&$this, 'filter_post_edit'), 10, 1);

			// Clean up all legacy information from old posts
			add_filter('peepso_activity_content', array(&$this, 'filter_remove_legacy'), 20, 1);
			add_filter('peepso_remove_shortcodes', array(&$this, 'filter_remove_legacy'), 30, 1);

			// create album extra fields
			add_filter('peepso_photo_album_extra_fields', array(&$this, 'photo_album_extra_fields'), 10, 1);
			add_filter('peepso_photo_album_show_extra_fields', array(&$this, 'photo_album_show_extra_fields'), 10, 3);
			add_filter('peepso_photo_album_update_location', array(&$this, 'photo_album_update_location'), 10);
		}

		## Query modifiers
		// modify limit
		add_filter('peepso_profile_fields_query_limit', array(&$this, 'filter_profile_fields_query_limit'));

		// Compare last version stored in transient with current version
		if( $this::PLUGIN_VERSION.$this::PLUGIN_RELEASE != get_transient($trans = 'peepso_'.$this::PLUGIN_SLUG.'_version')) {
			set_transient($trans, $this::PLUGIN_VERSION.$this::PLUGIN_RELEASE);
			$this->activate();
		}
	}

	# # # # # # # # # # User Front End # # # # # # # # # #

	/**
	 * POSTBOX - add the Location button
	 * @param  array $interactions An array of interactions available.
	 * @return array $interactions
	 */
	public function postbox_interactions($interactions = array())
	{
		wp_enqueue_script('peepsolocation-js');
		wp_enqueue_style('locso');

		$interactions['location'] = array(
			'label' => __('Location', 'peepso-location'),
			'id' => 'location-tab',
			'class' => 'ps-postbox__menu-item',
			'icon' => 'map-marker',
			'click' => 'return;',
			'title' => __('Set a Location for your post', 'peepso-location'),
			'extra' => PeepSoTemplate::exec_template('location', 'interaction', NULL, TRUE),
		);

		return ($interactions);
	}

	public function filter_profile_fields_query_limit( $limit )
	{
		$limit = $limit + 1;

		return $limit;
	}

	/**
	 * EP add field types
	 * @param array $fieldtypes An array of field types
	 * @return array modified $fieldtypes
	 */
	public function admin_profile_field_types($fieldtypes)
	{
		$fieldtypes[] = 'location';

		return $fieldtypes;
	}

	/**
	 * PHOTO ALBUM - add the Location field
	 * @param  array $fields An array of interactions available.
	 * @return array $fields
	 */
	public function photo_album_extra_fields($fields = array())
	{
		wp_enqueue_script('peepsolocation-js');
		wp_enqueue_style('locso');

		$fields['location'] = array(
			'label' => __('Location', 'peepso-location'),
			'field' => '<input type="text" name="album_location" class="ps-input ps-js-location" value="" />',
			'isfull' => true,
			'extra' => PeepSoTemplate::exec_template('location', 'photo_album_extra_fields', NULL, TRUE),
		);

		return ($fields);
	}

	/**
	 * PHOTO ALBUM - display the Location field
	 * @param  array $fields An array of interactions available.
	 * @return array $fields
	 */
	public function photo_album_show_extra_fields($extras, $post_id, $can_edit)
	{
		$loc = get_post_meta($post_id, 'peepso_location', TRUE);

		if ($can_edit || $loc) {
			$data = array(
				'post_id' => $post_id,
				'can_edit' => $can_edit,
				'loc' => $loc
			);
			$extras = PeepSoTemplate::exec_template('location', 'photo_album_show_extra_fields', $data, TRUE);
		}

		return $extras;
	}

	/**
	 * PHOTO ALBUM - update metadata
	 * @param  int $post_id The post ID to add the metadata in.
	 * @param  object $post The WP_Post object.
	 */
	public function photo_album_update_location($save = array())
	{
		$input = new PeepSoInput();

		$owner = $input->val('user_id');
		$post_id = $input->val('post_id');
		$location = $input->val('location', NULL);

        if (FALSE === wp_verify_nonce($input->val('_wpnonce'), 'set-album-location')) {
        	$save['success'] = FALSE;
			$save['error'] = __('Request could not be verified.', 'peepso-location');
        } else {
        	$the_post = get_post($post_id);
			if(get_current_user_id() === intval($the_post->post_author)) {

				if (FALSE === is_null($location)) {
					update_post_meta($post_id, 'peepso_location', $location);

					$save['success'] = TRUE;
					$save['msg'] = __('Photo album location saved.', 'peepso-location');
				} else {
					$save['success'] = FALSE;
					$save['msg'] = __('Missing field location.', 'peepso-location');
				}
			}
			else
			{
				$save['success'] = FALSE;
				$save['msg'] = __('You are not authorized to change this album location.', 'peepso-location');
			}
		}

		return $save;
	}

	/**
	 * POSTBOX - set a flag allowing the post content to be empty
	 * @param string $allowed
	 * @return boolean
	 */
	public function activity_allow_empty_content($allowed)
	{
		$input = new PeepSoInput();
		$location = $input->val('location');
		if (!empty($location)) {
			$allowed = TRUE;
		}
		return ($allowed);
	}

	/**
	 * POST CREATION - build metadata
	 * @param  int $post_id The post ID to add the metadata in.
	 * @param  object $post The WP_Post object.
	 */
	public function insert_post($post_id)
	{
		$input = new PeepSoInput();
		$location = $input->val('location', NULL);

		if (FALSE === is_null($location)) {
			update_post_meta($post_id, 'peepso_location', $location);
		} else {
			delete_post_meta($post_id, 'peepso_location');
		}
	}

	/**
	 * POST RENDERING - add location information to post extras array
	 * @return array
	 */
	public function filter_post_extras( $extras = array() )
	{
		global $post;
		$loc = get_post_meta($post->ID, 'peepso_location', TRUE);

		if ($loc) {
			ob_start();
			?>
			<span>
			<a
				href="javascript:" title="<?php echo esc_attr($loc['name']);?>"
				onclick="pslocation.show_map(<?php echo $loc['latitude'];?>, <?php echo $loc['longitude'];?>, '<?php echo esc_attr($loc['name']);?>');">
				<i class="ps-icon-map-marker"></i><?php echo $loc['name'];?>
			</a>
			</span>
			<?php
			$extras[] = ob_get_clean();
		}

		return $extras;
	}

	/**
	 * POST RENDERING - clean old location information and shortcodes
	 * @return string
	 */
	public function filter_remove_legacy($content)
	{
		// Clean up old info attached to the post
		$regex = '/(<span>&mdash;)[\s\S]+(<\/span>)/';
		$content = preg_replace($regex, '', $content);

		// Since 1.6.1 we don't use shortcodes
		$content = preg_replace('/\[peepso_geo(?:.*?)\][\s\S]*\[\/peepso_geo]/', '', $content);

		$content=trim($content);

		return $content;
	}

	/**
	 * Enqueue the assets
	 */
	public function enqueue_scripts()
	{
		global $wp_query;
		$api_key = PeepSo::get_option('location_gmap_api_key');

		wp_localize_script('peepso', 'peepsogeolocationdata',
			array(
				'api_key' => $api_key,
				'template_selector' => PeepSoTemplate::exec_template('location', 'selector', array(), TRUE),
				'template_postbox' => PeepSoTemplate::exec_template('location', 'postbox', array(), TRUE),
			)
		);

		if (self::PLUGIN_DEV) {
			wp_enqueue_script('peepsolocation-js', plugin_dir_url(__FILE__) . 'assets/js/location.js', array('peepso', 'jquery-ui-position', 'peepso-lightbox'), self::PLUGIN_VERSION, TRUE);
			wp_enqueue_script('peepsolocation-postbox', plugin_dir_url(__FILE__) . 'assets/js/postbox.js', array('jquery'), self::PLUGIN_VERSION, TRUE);
		} else {
			wp_enqueue_script('peepsolocation-js', plugin_dir_url(__FILE__) . 'assets/js/bundle.min.js', array('peepso', 'jquery-ui-position', 'peepso-lightbox'), self::PLUGIN_VERSION, TRUE);
		}
	}
	# # # # # # # # # # PeepSo Admin # # # # # # # # # #

	/**
	 * Add settings for the GMaps API key
	 */
	public function register_config_options($config_groups)
	{
		// All options other than the path to the directory should be hidden on FIRST activation.
		if( !isset($_GET['filesystem']) ) {
			$section = 'location_';
			$gmap_api_key = array(
				'name' => $section . 'gmap_api_key',
				'label' => __('Google Maps API Key (v3)', 'peepso-location'),
				'type' => 'text',
				'field_wrapper_class' => 'controls col-sm-8',
				'field_label_class' => 'control-label col-sm-4',
				'value' => PeepSoConfigSettings::get_instance()->get_option($section . 'gmap_api_key')
			);

			$config_groups[] = array(
				'name' => 'location',
				'title' => __('Locations Settings', 'peepso-location'),
				'fields' => array($gmap_api_key),
				'context' => 'right'
			);
		}

		return ($config_groups);
	}

	# # # # # # # # # # Utilities: Activation, Licensing, PeepSo detection and compatibility  # # # # # # # # # #

	/**
	 * Plugin activation.
	 * Check PeepSo
	 * @return bool
	 */
	public function activate()
	{
		if (!$this->peepso_check()) {
			return (FALSE);
		}

		$this::install_fieldlocation();

		return (TRUE);
	}

	/**
	 * Install location field
	 *
	 */
	public static function install_fieldlocation( $verbose = FALSE )
	{
		$post_defaults = array(
				'post_status'		=> 'publish',
				'post_type'			=> 'peepso_user_field',
		);

		$fields = array(

				'location' => array(
						'post' => array(
								'post_title'	=> __('Location','peepso-location'),
								'post_content'	=> __('Share your location','peepso-location'),
						),
						'meta'	=>	array(
								'order'						=>	6,
								'class'						=> 	'location',
								'method'					=>	'_render_link_location',
								'method_form'				=>	'_render_map_selector',

								'is_core'					=> 	2,
								'default_acc'				=>  PeepSo::ACCESS_MEMBERS,
						),
				),
		);

		foreach($fields as $post_name => $post_data) {

			// try to find an existing field
			$get_post_by = array(
				'name'=>$post_name,
				'post_type'=>'peepso_user_field'
			);

			$post_query = new WP_Query($get_post_by);
			$update = FALSE;

			if(count($post_query->posts)) {
				$post_id = $post_query->posts[0]->ID;
				$update = TRUE;
			} else {
				// otherwise insert
				$post = array_merge(array('post_name' => $post_name), $post_data['post'], $post_defaults);
				$post_id = wp_insert_post($post);
				$update = FALSE;
			}

			if( TRUE === $verbose) {
				var_dump('Post ID:'. $post_id);
				var_dump('Update:'. (int) $update);
			}

			foreach($post_data['meta'] as $key=>$value) {
				// only inject meta if it's a new post or the key is empty
				if( FALSE === $update ) {
					add_post_meta($post_id, $key, $value, TRUE);
				}
			}
		}
	}

	/**
	 * Check if PeepSo class is present (ie the PeepSo plugin is installed and activated)
	 * If there is no PeepSo, immediately disable the plugin and display a warning
	 * @return bool
	 */
	public function peepso_check()
	{
		if (!class_exists('PeepSo')) {
			add_action('admin_notices', array(&$this, 'peepso_disabled_notice'));
			unset($_GET['activate']);
			deactivate_plugins(plugin_basename(__FILE__));
			return (FALSE);
		}

		return (TRUE);
	}

	/**
	 * Display a message about PeepSo not present
	 */
	public function peepso_disabled_notice()
	{
		?>
		<div class="error fade">
			<strong>
				<?php echo sprintf(__('The %s plugin requires the PeepSo plugin to be installed and activated.', 'peepso-location'), self::PLUGIN_NAME);?>
				<a href="<?php echo self::PEEPSOCOM_LICENSES;?>" target="_blank">
					<?php _e('Get it now!', 'peepso-location');?>
				</a>
			</strong>
		</div>
		<?php
	}

	public function api_key_missing_notice()
	{?>
		<div class="error">
			<strong>
				<?php echo __('Due to changes in Google Maps API it\'s required to use an API key for the LocSo plugin to work properly.', 'peepso-location');?>

				<?php echo __('You can get the API key', 'peepso-location');?>
				<a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank"><?php _e('here', 'peepso-location');?></a>.

				<?php echo __('Documentation for LocSo can be found', 'peepso-location');?>
				<a href="http://docs.peepso.com/article/139-google-maps-api-key-v3" target="_blank"><?php _e('here', 'peepso-location');?></a>.

			</strong>
		</div>
		<?php

	}

	/**
	 * Hook into PeepSo Core for compatibility checks
	 * @param $plugins
	 * @return mixed
	 */
	public function filter_all_plugins($plugins)
	{
		$plugins[plugin_basename(__FILE__)] = get_class($this);
		return $plugins;
	}

	public function filter_post_edit( $data = array() )
	{
		$input = new PeepSoInput();
		$post_id = $input->int('postid');

		$location = get_post_meta($post_id, 'peepso_location', TRUE);
		if (!empty($location)) {
			$data['location'] = $location;
		}

		return $data;
	}
}

PeepSoLocation::get_instance();

// EOF
