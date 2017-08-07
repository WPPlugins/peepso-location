(function( root, $, factory ) {

/**
 * PsLocation global instance.
 * @name pslocation
 * @type {PsLocation}
 */
pslocation = new (factory( root, $ ));

// initialize location on create album dialog
ps_observer.add_filter('photo_create_album', function( obj ) {
	var $el = obj.popup,
		$input = $el.find('.ps-js-location');
	pslocation.init_location_search( $input );
	return obj;
}, 10, 1);

// edit location field
$(function() {
	ps_observer.add_filter('profile_field_save', function( value, $input ) {
		if ( $input.hasClass('ps-js-field-location') ) {
			var data = $input.data();
			if ( data.location && data.latitude && data.longitude ) {
				return JSON.stringify({
					name: data.location,
					latitude: data.latitude,
					longitude: data.longitude
				});
			}
		}
		return value;
	}, 10, 2 );

	ps_observer.add_action('profile_field_save_register', function( $input ) {
		if ( $input.hasClass('ps-js-field-location') ) {
			var data = $input.data(),
				$hidden;
			if ( data.location && data.latitude && data.longitude ) {
				$hidden = $('<input type="hidden" name="' + $input.attr('name') + '" />');
				$input.removeAttr('name');
				$hidden.insertAfter( $input );
				$hidden.val( JSON.stringify({
					name: data.location,
					latitude: data.latitude,
					longitude: data.longitude
				}) );
			}
		}
	}, 10, 1 );

	var $input = $('.ps-js-field-location');
	$input.each(function() {
		pslocation.init_location_search( $( this ) );
	});
});

// edit location
$(function() {
	var $ct = $('.ps-js-album-location'),
		$text = $ct.find('.ps-js-album-location-text'),
		$empty = $ct.find('.ps-js-album-location-empty'),
		$editor = $ct.find('.ps-js-album-location-editor'),
		$btnEdit = $ct.find('.ps-js-album-location-edit'),
		$btnRemove = $ct.find('.ps-js-album-location-remove'),
		$submit = $editor.find('.ps-js-submit'),
		$input = $editor.find('input').eq(0),
		value;

	// edit location
	$btnEdit.click(function() {
		if ( $editor.is(':visible') ) {
			return;
		}

		$text.hide();
		$empty.hide();
		$btnEdit.hide();
		$btnRemove.hide();
		$editor.show();

		$input.data('original-value', value = $input.val() ); // save original value
		$input.focus().val('').val( value ); // focus

		pslocation.init_location_search( $input );

		$editor.off('click input');

		// handle cancel button
		$editor.on('click', '.ps-js-cancel', function() {
			$input.val( value );
			$editor.off('click').hide();
			$btnEdit.show();
			if ( value ) {
				$text.show();
				$btnRemove.show();
			} else {
				$empty.show();
			}
		});

		// handle save button
		$editor.on('click', '.ps-js-submit', $.proxy(function( e ) {
			var data = $input.data();
			var params = {
				user_id: peepsodata.userid,
				post_id: data.postId,
				type_extra_field: 'location',
				'location[name]': data.location,
				'location[latitude]': data.latitude,
				'location[longitude]': data.longitude,
				_wpnonce: $('#_wpnonce_set_album_location').val()
			};
			peepso.postJson('photosajax.set_album_extra_field', params, function( json ) {
				if ( json.success ) {
					$editor.off('click').hide();
					$input.val( data.location );
					$text.find('span').html( data.location );
					$text.show();
					$empty.hide();
					$btnEdit.show();
					$btnRemove.show();
				}
			});
		}, this ));
	});

	// remove location
	$btnRemove.click(function() {
		var data = $btnRemove.data();
		var params = {
			user_id: peepsodata.userid,
			post_id: data.postId,
			type_extra_field: 'location',
			location: '',
			_wpnonce: $('#_wpnonce_set_album_location').val()
		};
		peepso.postJson('photosajax.set_album_extra_field', params, function( json ) {
			if ( json.success ) {
				$input.val('');
				$text.find('span').html('');
				$text.hide();
				$empty.show();
				$btnRemove.hide();
			}
		});
	});
});

})( window, jQuery, function( window, $ ) {

/**
 * PeepSo geolocation class.
 * @class PsLocation
 */
function PsLocation() {
	this.coords = null;
	this.$places_container = null;
	this.$input_search = null;
	this.marker = null;
	this.map = null;
	this.selected_place = null;
	this._search_service = null;
	this._latLang = null;
	this.last_selected_place = null;
	this.location_selected = false;
	this.can_submit = false;
}

/**
 * Initializes this instance's container and selector reference to a postbox instance.
 * Called on postbox.js _load_addons()
 */
PsLocation.prototype.init = function()
{
	if (_.isNull(this.$postbox))
		return;

	var that = this;

	ps_observer.add_filter("peepso_postbox_can_submit", function(can_submit) {
		can_submit.soft.push( that.can_submit );
		return can_submit;
	}, 30, 1);

	$(this.$postbox).on("click", "#location-tab a", function() {
		that.toggle_input();
	});

	this.$input_search = $("#postbox_loc_search", this.$postbox);
	this.$container = $("#pslocation", this.$postbox);
	this.$postboxcontainer = this.$postbox.$textarea.parent();
	this.$places_container = $(".ps-postbox-locations", this.$container);

	// Add delay 15 seconds before call 'location_search()' to give user enough time to type new location manually
	// It's important because 'location_search()' will trigger 'click' event to draw map using first location
	var timer = null;
	this.$input_search.on("keyup", function() {
		var t = this;
		clearTimeout(timer);
		var $loading = $("<li>" + $("#pslocation-search-loading").html() + "</li>");
		that.$places_container.html($loading);
		timer = setTimeout(function() {
			that.location_search($(t).val());
		}, 1500);
	});

	ps_observer.add_filter("postbox_req_" + this.$postbox.guid, function(req, other) {
		return that.postbox_request(req, other);
	}, 10, 1);

	this.$postbox.on("postbox.post_cancel postbox.post_saved", function(evt, request, response) {
		that.postbox_cancel_saved(request, response);
	});

	this.$select_location = $(".ps-location-action .ps-add-location", this.$container);
	this.$remove_location = $(".ps-location-action .ps-remove-location", this.$container);

	this.$select_location.on("click", function(e) { e.preventDefault(); that.on_select_location(); });
	this.$remove_location.on("click", function(e) { e.preventDefault(); that.on_remove_location(); });

	$(this.$postbox).on("peepso.interaction-hide", "#location-tab a", function() {
		that.$container.addClass("hidden");
	});

	ps_observer.add_filter("peepso_postbox_addons_update", function(list) {
		if ( that.location_selected ) {
			list.unshift("<b><i class=ps-icon-map-marker></i>" + that.location_selected + "</b>");
		}
		return list;
	}, 10, 1);


};

/**
 * Adds the selected location/place when Post button is clicked and before submitted
 * @param {object} postbox request object
 * @param {mixed} other currently not in used
 */
PsLocation.prototype.postbox_request = function(req, other)
{
	if (null !== this.selected_place) {
		req.location = {
			name: this.selected_place.name,
			latitude: this.selected_place.geometry.location.lat(),
			longitude: this.selected_place.geometry.location.lng()
		};
	}
	return (req);

	ps_observer.add_filter("postbox_req" + this.$postbox.guid, function(req, other) {
		if (null !== that.selected_place) {
			req.location = {
				name: that.selected_place.name,
				latitude: that.selected_place.geometry.location.lat(),
				longitude: that.selected_place.geometry.location.lng()
			};
		}
		return (req);
	}, 10, 1);
}

/**
 * Called after postbox is saved or cancelled
 * @param {object} request Postbox request object - available only for after saved
 * @param {object} response Postbox response - available only for after saved
 */
PsLocation.prototype.postbox_cancel_saved = function(request, response)
{
	/*
	if ('undefined' !== typeof(request)) {
		if (1 === response.success)
			psmessage.hide().show("", response.notices[0]).fade_out(psmessage.fade_time);
		else if (1 === response.has_errors)
			psmessage.show('', response.errors[0]);
	}
	*/

	this.$container.addClass("hidden");
	this.$input_search.val("");
	this.$remove_location.hide();
	//this.$select_location.hide();
	this.$select_location.show();
	this.$postboxcontainer.find("span#postlocation").remove();
	this.selected_place = null;
	this.location_selected = false;
	this.can_submit = false;
	this.$postbox.on_change();
}

/**
 * Defines the postbox this instance is running on.
 * Called on postbox.js _load_addons()
 * @param {object} postbox This refers to the parent postbox object which this plugin may inherit, override, and manipulate its input boxes and behavior
 */
PsLocation.prototype.set_postbox = function(postbox)
{
	this.$postbox = postbox;
};

/**
 * Searches for a location using the google API
 * @param {string} query The location to search for.
 * @param {function} success_callback Function to run after the search is complete.
 */
PsLocation.prototype.location_search = function(query, success_callback)
{
	var that = this;

	if (_.isEmpty(this.map)) {
		this._latLang = new google.maps.LatLng(0, 0);
		this.draw_map(this._latLang);
	}

	if (_.isEmpty(query)) {
		this.draw_map(this._latLang);
		return;
	}

	this.get_search_service().textSearch({
			query: query,
			location: this._latLang,
			radius: 50000
		},
		function(results, status) {
			that.set_places(results, status);

			// Uses first location to draw map
			if ( !that.$select_location.is(":visible") ) {
				that.$places_container.find("li").first().trigger("click");
			}

			if (typeof(Function) === typeof(success_callback))
				success_callback();
		}
	);
};

/**
 * Sets the location value and appends the location name to the postbox.
 */
PsLocation.prototype.on_select_location = function()
{
	if (null === this.selected_place)
		this.selected_place = this.last_selected_place;

	this.$select_location.hide();
	this.$remove_location.show();

	this.$container.addClass("hidden");

	this.location_selected = '';
	if ( this.selected_place ) {
		this.location_selected = this.selected_place.name;
	}

	this.can_submit = true;
	this.$postbox.on_change();


};

/**
 * Removes the location value and name on the postbox
 */
PsLocation.prototype.on_remove_location = function()
{
	this.$select_location.show();
	this.$remove_location.hide();

	this.selected_place = null;
	this.$postboxcontainer.find("span#postlocation").remove();
	this.$container.addClass("hidden");

	this.location_selected = false;
	this.can_submit = false;
	this.$postbox.on_change();
};

/**
 * Toggles the display of the location UI.
 */
PsLocation.prototype.toggle_input = function()
{
	this.$container.toggleClass("hidden");

	this.$input_search.val("");
	this.location = null;

	if (!this.$container.hasClass("hidden")) {
		var that = this;
		this.load_library(function() {
			that.shown();
		}.bind(that));
	}
};

/**
 * Fires after the location UI is shown and asks the user for geolocation information.
 */
PsLocation.prototype.shown = function() {
	var that = this;

	this.$input_search.focus();

	// Only draw the map once per page load
	if ( false === _.isEmpty(this.map) ) {
		return;
	}

	this.detect_location().done(function( lat, lng ) {
		that.draw_default_map( lat, lng );
	}).fail(function() {
		that.draw_default_map();
	});
};

/**
 * Uses the user's current location to draw the map
 */
PsLocation.prototype.draw_default_map = function( lat, lng ) {
	if (lat && lng) {
		var location = new google.maps.LatLng(lat, lng);
		this.draw_map(location);
	} else {
		var $map = this.$postbox.find('.ps-postbox-map');
		$map.show();
		this.$input_search.removeAttr('disabled');
		this.$input_search.focus();
	}
};

/**
 * Draws the google map
 * @param {object} location The default center/marker coordinates(latitude and longitude) of google.maps.LatLng object used to render maps
 * @param {boolean} search_nearby If true, search nearby places/locations. Default is true.
 */
PsLocation.prototype.draw_map = function(location, search_nearby)
{
	if (false === _.isBoolean(search_nearby))
		search_nearby = true;

	if (false === (location instanceof google.maps.LatLng))
		return;

	var $map = this.$postbox.find('.ps-postbox-map');

	$("#pslocation .ps-postbox-loading", this.$postbox).hide();
	$map.show();
	this.$input_search.removeAttr('disabled');

	var that = this;
	this._latLang = location;

	var mapOptions = {
		center: location,
		zoom: 15,
		draggable: false,
		scrollwheel: false,
		disableDefaultUI: true
	};

	ps_observer.apply_filters("ps_location_before_draw_map", $("#pslocation", this.$postbox));

	// Draw map
	if (_.isEmpty(this.map)) {
		this.map = new google.maps.Map( $map.get(0), mapOptions );

		// Draw marker
		this.marker = new google.maps.Marker({
			position: mapOptions.center,
			map: this.map,
			title:"You are here (more or less)"
		});
	} else {
		this.set_map_center(this._latLang);
	}

	if (search_nearby) {
		// Search nearby places, default action
		var request = {
			location: this._latLang,
			types: [ "establishment" ],
			rankBy: google.maps.places.RankBy.DISTANCE
		};

		this.get_search_service().nearbySearch(request, function(results, status) {
			that.set_places(results, status);
			if ( !that.$select_location.is(":visible") ) {
				that.$places_container.find("li").first().trigger("click");
			}
		});
	}
};

/**
 * Returns an instance of the google places service
 */
PsLocation.prototype.get_search_service = function()
{
	if (_.isEmpty(this.search_service))
		this._search_service = new google.maps.places.PlacesService(this.map);

	return (this._search_service);
};

/**
 * Renders the retrieved places to the dropdown.
 * @param {array} results for google maps places
 * @param {int} status of google maps search
 */
PsLocation.prototype.set_places = function(results, status)
{
	var that = this;
	this.$places_container.find("li").remove();

	if (status === google.maps.places.PlacesServiceStatus.OK) {
 		for (var i = 0; i < results.length; i++)
			this.add_place(results[i]);
	}

	$("li", this.$places_container).on("click", function() {
		$(".ps-location-action", this.$container).show();
		that.$select_location.show();
		that.$remove_location.hide();
	});
};

/**
 * Adds the place to the search list.
 * @param {object} place Contains the details of the place/location in google.maps.Map object which represents a single option in the search result
 */
PsLocation.prototype.add_place = function(place)
{
	if (!_.isEmpty(place.formatted_address))
		place.vicinity = place.formatted_address;

	if (_.isEmpty(place.vicinity))
		return;

	var that = this;

	var $li = $("<li></li>");
	$li.append("<p class='reset-gap'>" + place.name + "</p>");

	$li.append("<span>" + place.vicinity + "</span>");

	this.$places_container.append($li);

	$li.on("click", function() {
		that.set_map_center(place.geometry.location);
		that.$input_search.val(place.name);
		that.selected_place = place;
		that.last_selected_place = that.selected_place;
	});
};

/**
 * Draw a marker and center the view point to the location
 * @param {object} location A google latlang instance.
 */
PsLocation.prototype.set_map_center = function(location)
{
	this.map.setCenter(location);
	this.marker.setPosition(location);
};

/**
 * TODO: docblock
 */
PsLocation.prototype.load_library = function(callback)
{
	if (this.gmap_is_loaded) {
		callback();
		return;
	}

	this.load_library_callbacks || (this.load_library_callbacks = []);
	this.load_library_callbacks.push( callback );

	if (this.gmap_is_loading) {
		return;
	}

	this.gmap_is_loading = true;

	var script = document.createElement('script');
	var api_key = peepsogeolocationdata.api_key;
	var that = this;

	script.type = 'text/javascript';
	script.src = 'https://maps.googleapis.com/maps/api/js?libraries=places' +
		(api_key ? ('&key=' + api_key) : '') +
		'&callback=ps_gmap_callback';

	window.ps_gmap_callback = function() {
		that.gmap_is_loaded = true;
		that.gmap_is_loading = false;
		while (that.load_library_callbacks.length) {
			( that.load_library_callbacks.shift() )();
		}
		delete window.ps_gmap_callback;
	};

	document.body.appendChild(script);
};

/**
 * TODO: docblock
 */
PsLocation.prototype.show_map = function( lat, lng, name ) {
	peepso.lightbox([{ content: '<div class="ps-js-mapct" style="width:700px;height:400px;display:inline-block" />' }], {
		simple: true,
		nofulllink: true,
		afterchange: $.proxy(function( lightbox ) {
			this.load_library(function() {
				var mapct = lightbox.$container.find( '.ps-js-mapct' );
				var location = new google.maps.LatLng( lat, lng );
				var map = new google.maps.Map( mapct[0], {
					center: location,
					zoom: 14
				});

				var marker = new google.maps.Marker({
					position: location,
					map: map
				});
			});
		}, this )
	});
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * TODO: docblock
 */
PsLocation.prototype.init_location_search = function( $input ) {
	if ( $input.data('location-search') ) {
		return;
	}

	$input.data('location-search', 1 );

	var template = peepsogeolocationdata.template_selector;

	var $div = $( template ),
		$loc = $div.children('.ps-js-location'),
		$map = $div.find('.ps-js-location-map'),
		$list = $div.find('.ps-js-location-list'),
		$close = $div.find('.ps-js-close'),
		$select = $div.find('.ps-js-select'),
		$remove = $div.find('.ps-js-remove'),
		$loading = $div.find('.ps-js-location-loading'),
		$result = $div.find('.ps-js-location-result'),
		$placeholder = $div.find('.ps-js-location-placeholder'),
		listitem = $div.find('.ps-js-location-listitem').get(0).outerHTML;

	$input.on('input.ps-location', $.proxy( _.debounce(function( e ) {
		var query = e.target.value;
		if ( !query ) {
			return;
		}
		if ( $placeholder ) {
			$placeholder.remove();
			$placeholder = null;
		}
		$result.hide();
		$loading.show();
		$div.show();
		this.search( query ).done(function( results ) {
			var html = [],
				description, item, i;
			for ( i = 0; i < results.length; i++ ) {
				description = results[i].description;
				description = description.split(/,\s(.+)?/);
				item = listitem
					.replace('{place_id}', results[ i ].place_id )
					.replace('{name}', description[0] )
					.replace('{description}', description[1] || '&nbsp;' );
				html.push( item );
			}
			$list.html( html.join('') );
			$loading.hide();
			$result.show();
			$div.show();
		});
	}, 200 ), this ));

	$input.on('blur.ps-location', $.proxy(function( e ) {
		$div.hide();
		$select.hide();
		$input.val( $input.data('location') || '' );
		if ( $input.data('location') ) {
			$remove.show();
		}
	}, this ));

	$input.on('focus.ps-location', $.proxy(function( e ) {
		$list.find('.ps-location-selected').removeClass('ps-location-selected');
		$div.show();
	}, this ));

	$list.on('mousedown', 'a.ps-js-location-listitem', $.proxy(function( e ) {
		var $item = $( e.currentTarget ),
			name = $item.find('.ps-js-location-listitem-name').text(),
			id = $item.data('place-id');

		e.preventDefault();
		e.stopPropagation();

		$item.addClass('ps-location-selected');
		$item.siblings().removeClass('ps-location-selected');
		$select.show();
		$remove.hide();
		$map.show();
		this._gmap_get_place_detail( id ).done( $.proxy(function( place ) {
			var name = place.name,
				loc = place.geometry.location;
			$input.data('tmp-location', name ).data('tmp-latitude', loc.lat() ).data('tmp-longitude', loc.lng() );
			this._gmap_render_map( $map[0], place );
		}, this ));
	}, this ));

	$close.on('mousedown', function() {
		$input.trigger('blur.ps-location');
	});

	$select.on('mousedown', function( e ) {
		e.preventDefault();
		e.stopPropagation();
		$input.data('location', $input.data('tmp-location'));
		$input.data('latitude', $input.data('tmp-latitude'));
		$input.data('longitude', $input.data('tmp-longitude'));
		$input.val( $input.data('location') );
		$select.hide();
		$remove.show();
		$input.trigger('blur.ps-location');
	});

	$remove.on('mousedown', function( e ) {
		e.preventDefault();
		e.stopPropagation();
		$input.removeData('location').removeData('latitude').removeData('longitude').val('');
		$list.find('.ps-location-selected').removeClass('ps-location-selected');
		$remove.hide();
		$map.hide();
	});

	$div.insertAfter( $input );
};

/**
 *
 */
PsLocation.prototype.search = function( query ) {
	return $.Deferred( $.proxy(function( defer ) {
		this._gmap_get_autocomplete_service().done(function( service ) {
			service.getPlacePredictions({ input: query }, function( results, status ) {
				if ( status === 'OK' ) {
					defer.resolve( results );
				}
			});
		});
	}, this ));
};

/**
 *
 */
PsLocation.prototype.detect_location = function() {
	var that = this;
	return $.Deferred(function( defer ) {
		if ( window.location.protocol !== 'https:' ) {
			defer.reject();
		} else {
			that.detect_location_by_device().done(function( lat, lng ) {
				defer.resolve( lat, lng );
			}).fail(function() {
				that.detect_location_by_gmap_api().done(function( lat, lng ) {
					defer.resolve( lat, lng );
				}).fail(function() {
					that.detect_location_by_ip().done(function( lat, lng ) {
						defer.resolve( lat, lng );
					}).fail(function() {
						defer.reject();
					});
				});
			});
		}
	});
};

/**
 *
 */
PsLocation.prototype.detect_location_by_device = function() {
	return $.Deferred( $.proxy(function( defer ) {
		navigator.geolocation.getCurrentPosition(
			function( position ) {
				defer.resolve( position.coords.latitude, position.coords.longitude );
			},
			function() {
				defer.reject();
			}, {
				timeout: 10000
			}
		);
	}, this ));
};

/**
 *
 */
PsLocation.prototype.detect_location_by_gmap_api = function() {
	return $.Deferred( $.proxy(function( defer ) {
		var api_key = peepsogeolocationdata.api_key;
		if ( this._client_location ) {
			defer.resolve( this._client_location );
		} else if ( !api_key ) {
			defer.reject();
		} else {
			$.post('https://www.googleapis.com/geolocation/v1/geolocate?key=' + api_key, function( coords ) {
				defer.resolve( coords.location.lat, coords.location.lng );
			}).fail(function( error ) {
				defer.reject( error );
			});
		}
	}, this ));
};

/**
 *
 */
PsLocation.prototype.detect_location_by_ip = function() {
	return $.Deferred( $.proxy(function( defer ) {
		var success;
		$.ajax({
			url: '//freegeoip.net/json/',
			dataType: 'jsonp',
			success: function( json ) {
				var lat = json.latitude,
					lng = json.longitude;
				if ( lat && lng ) {
					success = true;
					defer.resolve( lat, lng );
				}
			},
			complete: function() {
				if ( !success ) {
					defer.reject();
				}
			}
		});
	}, this ));
};

/**
 *
 */
PsLocation.prototype._gmap_load_library = function() {
	return $.Deferred( $.proxy(function( defer ) {
		this.load_library(function() {
			defer.resolve();
		});
	}, this ));
};

/**
 *
 */
PsLocation.prototype._gmap_get_autocomplete_service = function() {
	return $.Deferred( $.proxy(function( defer ) {
		if ( this._gmap_autocomplete_service ) {
			defer.resolve( this._gmap_autocomplete_service );
		} else {
			this._gmap_load_library().done( $.proxy(function() {
				this._gmap_autocomplete_service = new google.maps.places.AutocompleteService();
				defer.resolve( this._gmap_autocomplete_service );
			}, this ));
		}
	}, this ));
};

PsLocation.prototype._gmap_render_map = function( div, place ) {
	var location, viewport, map, marker;

	if ( place.geometry ) {
		location = place.geometry.location;
		viewport = place.geometry.viewport;
	} else {
		location = new google.maps.LatLng( place.latitude, place.longitude );
	}

	div = $( div ).show();
	map = div.data('ps-map');
	marker = div.data('ps-map-marker');

	if ( !map ) {
		map = new google.maps.Map( div[0], {
			center: location,
			zoom: 15,
			draggable: false,
			scrollwheel: false,
			disableDefaultUI: true
		});
		div.data('ps-map', map );
	}

	if ( !marker ) {
		marker = new google.maps.Marker({
			position: location,
			map: map,
			title: 'You are here (more or less)'
		});
		div.data('ps-map-marker', marker );
	}

	map.setCenter( location );
	marker.setPosition( location );
	if ( viewport ) {
		map.fitBounds( viewport );
	} else {
		map.setZoom( 15 );
	}
};

/**
 *
 */
PsLocation.prototype._gmap_get_place_service = function() {
	return $.Deferred( $.proxy(function( defer ) {
		if ( this._gmap_place_service ) {
			defer.resolve( this._gmap_place_service );
		} else {
			this._gmap_load_library().done( $.proxy(function() {
				var div = document.createElement('div');
				document.body.appendChild( div );
				this._gmap_place_service = new google.maps.places.PlacesService( div );
				defer.resolve( this._gmap_place_service );
			}, this ));
		}
	}, this ));
};

/**
 *
 */
PsLocation.prototype._gmap_get_place_detail = function( id ) {
	return $.Deferred( $.proxy(function( defer ) {
		if ( this._gmap_place_cache && this._gmap_place_cache[ id ] ) {
			defer.resolve( this._gmap_place_cache[ id ] );
		} else {
			this._gmap_get_place_service().done( $.proxy(function( service ) {
				service.getDetails({ placeId: id }, $.proxy(function( place, status ) {
					if ( status === 'OK' ) {
						this._gmap_place_cache || (this._gmap_place_cache = {});
						this._gmap_place_cache[ id ] = place;
						defer.resolve( place );
					} else {
						defer.reject( status );
					}
				}, this ));
			}, this ));
		}
	}, this ));
};

/**
 * Adds a new PsLocation object to a postbox instance.
 * @param {array} addons An array of addons to plug into the postbox.
 */
ps_observer.add_filter('peepso_postbox_addons', function(addons) {
	addons.push(new PsLocation);
	return addons;
}, 10, 1);

//
return PsLocation;

});
// EOF

(function( $, factory ) {

	var PsPostboxLocation = factory( $ );

	ps_observer.add_action('postbox_init', function( postbox ) {
		var inst = new PsPostboxLocation( postbox );
	}, 10, 1 );

})( jQuery, function( $ ) {

var evtSuffix = '.ps-postbox-location';

/**
 * Postbox location addon.
 */
function PsPostboxLocation() {
	this.__constructor.apply( this, arguments );
}

PsPostboxLocation.prototype = {

	__constructor: function( postbox ) {
		this.postbox = postbox;

		// element caches
		this.$doc = $( document );
		this.$toggle = postbox.$tabContext.find('#location-tab');
		this.$dropdown = postbox.$tabContext.find('#pslocation').html( peepsogeolocationdata.template_postbox );
		this.$input = this.$dropdown.find('input[type=text]');
		this.$loading = this.$dropdown.find('.ps-js-location-loading');
		this.$result = this.$dropdown.find('.ps-js-location-result');
		this.$list = this.$dropdown.find('.ps-js-location-list');
		this.$map = this.$dropdown.find('.ps-js-location-map');
		this.$select = this.$dropdown.find('.ps-js-select');
		this.$remove = this.$dropdown.find('.ps-js-remove');

		// item template
		this.listItemTemplate = peepso.template( this.$dropdown.find('.ps-js-location-fragment').text() );

		// event handler
		this.$toggle.on('click' + evtSuffix, $.proxy( this.onToggle, this ));
		this.$input.on('input' + evtSuffix, $.proxy( this.onInput, this ));
		this.$list.on('mousedown' + evtSuffix, 'a.ps-js-location-listitem', $.proxy( this.onSelectItem, this ));
		this.$select.on('mousedown' + evtSuffix, $.proxy( this.onSelect, this ));
		this.$remove.on('mousedown' + evtSuffix, $.proxy( this.onRemove, this ));

		// filters and actions
		postbox.add_action('update', this.update, 10, 2, this );
		postbox.add_filter('render_addons', this.render, 10, 1, this );
		postbox.add_filter('data', this.filterData, 10, 1, this );
		postbox.add_filter('data_validate', this.validate, 10, 2, this );
	},

	show: function() {
		this.$dropdown.removeClass('hidden');
		this.$doc.on('click' + evtSuffix, $.proxy( this.onDocumentClick, this ));

		// check whether initial value needs to be updated
		if ( this._needUpdate ) {
			this._needUpdate = false;

			if ( this._selected ) {
				this.$map.show();
				this.$select.hide();
				this.$remove.show();
				this.$result.show();

				this.updateList([{
					place_id: '',
					name: this._selected.name,
					description: this._selected.description
				}]);

				this.updateMap({
					latitude: this._selected.latitude,
					longitude: this._selected.longitude,
					zoom: this._selected.zoom
				});

			} else {
				this.$map.hide();
				this.$select.hide();
				this.$remove.hide();
				this.$result.hide();
				this.updateList([]);
			}
		}
	},

	hide: function() {
		this.$dropdown.addClass('hidden');
		this.$doc.off('click' + evtSuffix );
	},

	toggle: function() {
		if ( this.$dropdown.hasClass('hidden') ) {
			this.show();
		} else {
			this.hide();
		}
	},

	search: function( query ) {
		this.$result.hide();
		this.$loading.show();
		pslocation.search( query ).done( $.proxy(function( results ) {
			var list = [],
				description;

			for ( var i = 0; i < results.length; i++ ) {
				description = results[ i ].description;
				description = description.split(/,\s(.+)?/);
				list.push({
					place_id: results[ i ].place_id,
					name: description[ 0 ],
					description: description[ 1 ]
				});
			}

			this.updateList( list );
			this.$loading.hide();
			this.$result.show();
		}, this ));
	},

	filterData: function( data ) {
		if ( this._selected ) {
			data.location = this._selected;
		} else {
			data.location = '';
		}
		return data;
	},

	validate: function( valid, data ) {
		if ( this._selected ) {
			return true;
		}
		return valid;
	},

	render: function( list ) {
		var html;
		if ( this._selected ) {
			html  = '<i class="ps-icon-map-marker"></i>';
			html += '<b>' + this._selected.name + '</b>';
			list.push( html );
		}
		return list;
	},

	update: function( data ) {
		data = data && data.data || {};

		if ( data.location ) {
			this._selected = {
				name: data.location.name,
				description: data.location.description,
				latitude: data.location.latitude,
				longitude: data.location.longitude,
				zoom: data.location.zoom
			};

			this.$input.data('location', data.location.name );
			this.$input.data('latitude', data.location.latitude );
			this.$input.data('longitude', data.location.longitude );
			this.$input.val( data.location.name );
		} else {
			this._selected = false;
		}

		this._needUpdate = true;
		this.postbox.do_action('refresh');
	},

	updateList: function( list ) {
		var html = [];
		for ( var i = 0; i < list.length; i++ ) {
			html.push( this.listItemTemplate( list[ i ] ) );
		}
		this.$list.html( html.join('') );
	},

	updateMap: function( location ) {
		pslocation._gmap_load_library().done( $.proxy(function() {
			this.$map.show();
			pslocation._gmap_render_map( this.$map[0], location );
		}, this ));
	},

	select: function( name, lat, lng ) {
	},

	remove: function() {

	},

	destroy: function() {
		this.$toggle.off('click');
	},

	onToggle: _.throttle(function( e ) {
		e.preventDefault();
		e.stopPropagation();
		var $el = $( e.target );
		if ( ! this.$dropdown.is( $el ) && ! this.$dropdown.find( $el ).length ) {
			this.toggle();
		}
	}, 200 ),

	onInput: function() {
		var query = $.trim( this.$input.val() );
		if ( query ) {
			this.$result.hide();
			this.$loading.show();
			this._onInput( query );
		}
	},

	_onInput: _.debounce(function( query ) {
		this.search( query );
	}, 200 ),

	onSelectItem: function( e ) {
		var $item = $( e.currentTarget ),
			name = $item.find('.ps-js-location-listitem-name').text(),
			id = $item.data('place-id');

		e.preventDefault();
		e.stopPropagation();

		$item.addClass('ps-location-selected');
		$item.siblings().removeClass('ps-location-selected');
		this.$select.show();
		this.$remove.hide();
		this.$map.show();
		pslocation._gmap_get_place_detail( id ).done( $.proxy(function( place ) {
			var name = place.name,
				loc = place.geometry.location;
			this.$input.data('tmp-location', name ).data('tmp-latitude', loc.lat() ).data('tmp-longitude', loc.lng() );
			pslocation._gmap_render_map( this.$map[0], place );
		}, this ));
	},

	onSelect: function( e ) {
		e.preventDefault();
		e.stopPropagation();

		var name = this.$input.data('tmp-location'),
			latitude = this.$input.data('tmp-latitude'),
			longitude = this.$input.data('tmp-longitude');

		this.$input.data('location', name );
		this.$input.data('latitude', latitude );
		this.$input.data('longitude', longitude );
		this.$input.val( name );
		this.$select.hide();
		this.$remove.show();
		this.$dropdown.addClass('hidden');

		this._selected = {
			name: name,
			latitude: latitude,
			longitude: longitude
		};

		this.postbox.do_action('refresh');
	},

	onRemove: function( e ) {
		e.preventDefault();
		e.stopPropagation();
		this.$input.removeData('location').removeData('latitude').removeData('longitude').val('');
		this.$list.find('.ps-location-selected').removeClass('ps-location-selected');
		this.$remove.hide();
		this.$map.hide();

		this._selected = false;
		this.postbox.do_action('refresh');
	},

	onDocumentClick: function( e ) {
		var $el = $( e.target );
		if ( ! $el.closest( this.$toggle ).length ) {
			this.hide();
		}
	}

};

return PsPostboxLocation;

});