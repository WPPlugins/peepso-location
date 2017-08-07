<?php

class PeepSoFieldLocation extends PeepSoField
{
	public static $admin_label='Location';

	public function __construct($post, $user_id)
	{
		parent::__construct($post, $user_id);

		$this->render_methods['_render_link_location'] = __('clickable link','profileso');
		$this->render_form_methods['_render_map_selector'] = __('Map selector','profileso');

		$this->default_desc = __('Share your location','profileso');
		$this->data_type = 'array';
	}

	protected function _render_link_location()
	{
		if (empty($this->value) || ($this->is_registration_page)) {
			return $this->_render_empty_fallback();
		}

		$loc = $this->value;
		if ( isset($loc['name']) && isset($loc['latitude']) && isset($loc['longitude']) ) {
			ob_start();

			?><a
			href="javascript:" title="<?php echo esc_attr($loc['name']);?>"
			onclick="pslocation.show_map(<?php echo $loc['latitude'];?>, <?php echo $loc['longitude'];?>, '<?php echo esc_attr($loc['name']);?>');">
			<i class="ps-icon-map-marker"></i>
			<span><?php echo $loc['name'];?></span>
			</a><?php

			$html = ob_get_clean();
			return $html;
		}

		return $this->_render_empty_fallback();
	}

	protected function _render_map_selector_args()
	{
		ob_start();

		echo ' name="'.$this->input_args['name'].'"',
			' id="'.$this->input_args['id'].'"',
			' data-id="'.$this->id.'"',
		' class="ps-input ps-js-field-location"';

		return ob_get_clean();
	}

	protected function _render()
	{
		$name = '';

		if (!empty($this->value) && !$this->is_registration_page) {
			$loc = $this->value;
			$name = $loc['name'];
		}

		return esc_attr($name);
	}

	protected function _render_map_selector()
	{
		$name = '';
		$latitude = '';
		$longitude = '';

		if (!empty($this->value) && !$this->is_registration_page) {
			$loc = $this->value;
			$name = $loc['name'];
			$latitude = $loc['latitude'];
			$longitude = $loc['longitude'];
		}

		$ret = '<input type="text" value="' . esc_attr($name) . '"'
			. $this->_render_map_selector_args()
			. ' data-location="' . esc_attr($name) . '"'
			. ' data-latitude="' . esc_attr($latitude) . '"'
			. ' data-longitude="' . esc_attr($longitude) . '">';

		return $ret;
	}

	protected function _render_map_selector_register_args()
	{
		ob_start();

		$class = '';
		if (!empty($this->el_class )) {
			$class = ' ' . $this->el_class ;
		}

		echo ' name="'.$this->input_args['name'].'"',
			' id="'.$this->input_args['id'].'"',
			' data-id="'.$this->id.'"',
			' class="ps-input ps-js-field-location'.$class.'"';


		return ob_get_clean();
	}

	protected function _render_map_selector_register()
	{
		$name = '';
		$latitude = '';
		$longitude = '';

		if (!empty($this->value) && !$this->is_registration_page) {
			$loc = $this->value;
			$name = $loc['name'];
			$latitude = $loc['latitude'];
			$longitude = $loc['longitude'];
		}

		$ret = '<input type="text" value="' . esc_attr($name) . '"'
			. $this->_render_map_selector_args()
			. ' data-location="' . esc_attr($name) . '"'
			. ' data-latitude="' . esc_attr($latitude) . '"'
			. ' data-longitude="' . esc_attr($longitude) . '">';

		return $ret;
	}

}
