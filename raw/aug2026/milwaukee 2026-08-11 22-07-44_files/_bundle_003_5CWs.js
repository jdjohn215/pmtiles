NWS.initNamespace('NWS.MKE.Accessibility.MegaMenus', function () {
    var _params;
    var _lastFocusedElement; // Track focus for return
    var _debounceTimer; // For debouncing mouse events

    // Debounce function for mouse events
	function debounce(func, wait) {
		return function executedFunction() {
			var context = this;
			var args = arguments;
			var later = function() {
				clearTimeout(_debounceTimer);
				func.apply(context, args);  // Apply with captured context and arguments
			};
			clearTimeout(_debounceTimer);
			_debounceTimer = setTimeout(later, wait);
		};
	}

	function toggleMegaMenus(e){
		var $topControlsItem = $("#topControls > .siteBounds > .Freeform button");
		var index = $(e.currentTarget).closest('li').index(); 
		var menuNumber = index - 1;
		_lastFocusedElement = e.currentTarget; // Store for focus return
		$topControlsItem.removeAttr('tabindex');
		$('.MenuContainer:not(#mega' + menuNumber + ')').hide();
		$(e.currentTarget).closest('li').siblings('li').find('button').removeClass('Selected').attr('aria-expanded','false');
		if($(e.currentTarget).hasClass('Selected')) {
			closeAllMegaMenus();
		} else {
			$('#mega' + menuNumber).slideDown();
			$(e.currentTarget).addClass('Selected').attr('aria-expanded','true');
			// make all buttons not focusable when a megamenu is open, so focus goes to open menu
			$(e.currentTarget).closest('li').siblings('li').find('button').attr('tabindex','-1');
		}
		return false; // disables page scrolling with spacebar
	}

	function closeAllMegaMenus(){
		var $topControlsItem = $("#topControls > .siteBounds > .Freeform button");
		$('.MenuContainer').slideUp();
		$topControlsItem.removeAttr('tabindex').removeClass('Selected').attr('aria-expanded','false');
		// Return focus to last focused element
		if (_lastFocusedElement) {
			$(_lastFocusedElement).focus();
			_lastFocusedElement = null;
		}
	}	

	
	function openSubMenu(e) {
		const thisMenuButton = $(e);
		const thisMenuParent = thisMenuButton.closest('li');
		thisMenuButton.attr('aria-expanded', 'true').attr('tabindex','-1');
		thisMenuParent.toggleClass('ItemVisible').siblings().removeClass('ItemVisible').find('button.toggleMenuButton').attr('aria-expanded', 'false').removeAttr('tabindex');
	}

	// Handle keyboard navigation within submenus on county and department sites
	function handleMenuKeyNavigation(e) {
		const currentItem = e.target;
		const currentLi = currentItem.closest('li');
		const parentUl = currentLi.parentElement;
		const menuItems = Array.from(parentUl.children);
		const currentIndex = menuItems.indexOf(currentLi);
		
		switch(e.key) {
			case 'ArrowUp':
				e.preventDefault();
				const prevIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
				menuItems[prevIndex].querySelector('a').focus();
				break;
			case 'ArrowDown':
				e.preventDefault();
				const nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
				menuItems[nextIndex].querySelector('a').focus();
				break;
			case 'Home':
				e.preventDefault();
				menuItems[0].querySelector('a').focus();
				break;
			case 'End':
				e.preventDefault();
				menuItems[menuItems.length - 1].querySelector('a').focus();
				break;
		}
	}
	
	return {

        init: function (params) {
            _params = params;
			
            // sub menus
			_params.menuTabs = $(".MenuContainer .Freeform:first-child > ul > li");
			_params.element = $('.MenuContainer .Freeform:first-child > ul > li > a');
			_params.showFirst = $(".MenuContainer .Freeform:first-child > ul > li:first-child");
			_params.closeOnLast = $(".MenuContainer .Freeform:first-child > ul > li:last-child");
			_params.navArea = $('.MenuContainer');
														
				_params.element.after("<button class='toggleMenuButton' type='button' aria-expanded='false' />");					
				_params.element.each(function(){
					var menuTitle = $(this).text();
					$(this).next('button.toggleMenuButton').attr('aria-label',menuTitle + ' menu');
					// Enhanced ARIA attributes
					$(this).siblings('ul').attr('role', 'menu').attr('aria-label', menuTitle);
				});
				_params.showFirst.addClass('ItemVisible').find('.toggleMenuButton').attr('aria-expanded','true').attr('tabindex','-1');
				
				// Debounced mouse enter event
				var debouncedMouseEnter = debounce(function(e) {
					$(this).addClass('ItemVisible').find('button.toggleMenuButton').attr('aria-expanded','true').attr('tabindex','-1');
					$(this).siblings().removeClass('ItemVisible').find('button.toggleMenuButton').attr('aria-expanded','false').removeAttr('tabindex');
				}, 150);
				
				_params.menuTabs.on({
					mouseenter: debouncedMouseEnter
				});
				
				/* toggle submenu */
				$('.toggleMenuButton').on('click', function (e) {
					 var e = $(this);
					 openSubMenu(e);
				});		
				
				/* Add keyboard navigation to menu items */
				_params.navArea.on('keydown', 'a', handleMenuKeyNavigation);
				
				/* close megamenus when tab past last submenu items */
				_params.closeOnLast.find('button.toggleMenuButton').on('keydown', function(e) { 
					if (e.key === 'Tab') {
						// Fixed: Check if aria-expanded is false (not set it to false)
						if($(this).attr('aria-expanded') === 'false')
						closeAllMegaMenus();
					} 
				});				
				_params.closeOnLast.find('ul li:last-child a').on('keydown', function(e) { 
					if (e.key === 'Tab') {
						closeAllMegaMenus();
					} 
				});				

				/* close megamenus when shift-tab back from first submenu item */
				_params.showFirst.find('> a:first-child').on('keydown', function(e) { 
					if (e.shiftKey && e.key === 'Tab') { 
						closeAllMegaMenus();
					} 
				});	

				// mega menus
				var $topControlsItem = $("#topControls > .siteBounds > .Freeform button");
				$topControlsItem.each(function(){
					var megaTitle = $(this).text();
					var index = $(this).closest('li').index(); 
					var menuNumber = index - 1;
					// Enhanced ARIA attributes for mega menus
					$(this).attr('aria-controls', 'mega' + menuNumber);
					$('#mega' + menuNumber).attr('aria-labelledby', $(this).attr('id') || 'mega-btn-' + index);
					$('#mega' + menuNumber).find(".MenuContainerInside .Freeform:first-child > ul").attr('role', 'navigation').attr('aria-label',megaTitle );
				});
				$topControlsItem.click(function(e){
					toggleMegaMenus(e);
				});

				/* close on click outside megamenu	 */
				$(document).mouseup(function (e) {
					var container = $(".MenuContainer, #topControls > .siteBounds > .Freeform button");
					if (!container.is(e.target) // if the target of the click isn't the container...
						&& container.has(e.target).length === 0) // ... nor a descendant of the container
					{ closeAllMegaMenus(); }
				});

				/* close megamenu with escape key */
				document.addEventListener('keydown', function(e) {
					if (e.key === 'Escape') 
						closeAllMegaMenus();
				});
				
				
				

        }
    };
});
NWS.initNamespace("NWS.Modules.Accessibility.Support", function () {
	var _ = {  
		defaultScripts: [	
						  { key:"AccessibilityCSS", path: "/ClientCSS/NWS/Modules.Accessibility.Support/Accessibility.css" }, 
						  { key:"TopNavJS", path: "/CommonScripts/NWS/Modules.Accessibility.Support/TopNav.js"},
						  { key:"TopNavCSS", path: "/ClientCSS/NWS/Modules.Accessibility.Support/TopNav.css" },
						  { key:"BaseOverridesJS", path: "/CommonScripts/NWS/Modules.Accessibility.Support/BaseOverrides.js" },
						  { key:"TabsJS", path: "/CommonScripts/NWS/Modules.Accessibility.Support/Tabs.js" },
						  { key:"MegaMenuJS", path:"/CommonScripts/NWS/Modules.Accessibility.Support/MegaMenu.js" },							
						  { key:"MegaMenuCSS", path: "/ClientCSS/NWS/Modules.Accessibility.Support/MegaMenu.css" }
						   
		]	
		//returns scripts required by module from overrides for given key.  if no override, default returned
		,getScriptByKey: function(key) {			
			var scriptOverrides = _.params.scriptOverrides || [];
            return NWS.CommonScripts.ModuleManager.GetScriptByKey(key, _.defaultScripts, scriptOverrides);			
		},
		params:null,
		preloadScripts: null, 
		requiredScripts: null, 
		deferredScripts: null,
		initScripts: function() {
			var preloadScripts = _.params.preloadScripts || []; 
			var requiredScripts = _.params.requiredScripts || [];
			var deferredScripts = _.params.deferredScripts || [];
			
			requiredScripts.push(_.getScriptByKey("BaseOverridesJS"));
			requiredScripts.push(_.getScriptByKey("TabsJS"));
			requiredScripts.push(_.getScriptByKey("AccessibilityCSS"));
			
			if (typeof (_.params.topNavOptions) !== "undefined"){
                requiredScripts.push(_.getScriptByKey("TopNavJS"));
				requiredScripts.push(_.getScriptByKey("TopNavCSS"));
			}
			
			if (typeof (_.params.megaMenuOptions) !== "undefined"){
				requiredScripts.push(_.getScriptByKey("MegaMenuJS"));
				requiredScripts.push(_.getScriptByKey("MegaMenuCSS"));
			}	
			_.requiredScripts = requiredScripts; 
			_.preloadScripts = preloadScripts;
			_.deferredScripts = deferredScripts;
		},
		moduleLoadComplete: function(){
			var baseConfig = (typeof _.params.baseConfig === "undefined") ? {} : _.params.baseConfig;
            var tabsConfig = (typeof _.params.tabsConfig === "undefined") ? {} : _.params.tabsConfig;
            var topNavOptions = (typeof _.params.topNavOptions === "undefined") ? {} : _.params.topNavOptions;
			var megaMenuOptions = (typeof _.params.megaMenuOptions === "undefined") ? {} : _.params.megaMenuOptions;

            NWS.Modules.InitModule("NWS.Modules.Accessibility.BaseOverrides", baseConfig); 
            NWS.Modules.InitModule("NWS.Modules.Accessibility.Tabs", tabsConfig); 
            NWS.Modules.InitModule("NWS.Modules.Accessibility.TopNav", topNavOptions); 
			NWS.Modules.InitModule("NWS.Modules.Accessibility.MegaMenu", megaMenuOptions); 
		}		
	}	
    return {
		init: function (params) {
            _.params = params;
			_.initScripts();
			
			window.addEventListener("load", function(){
				NWS.Modules.Register(_.deferredScripts, null);
			});
			
        	NWS.Modules.Register(_.requiredScripts, null, "preload");
            NWS.Modules.Register(_.preloadScripts, null, "preload");
			NWS.Modules.Register(_.requiredScripts, _.moduleLoadComplete);
        }
    }
});
NWS.initNamespace("NWS.Display.Banner", function () {
    var _ = {
        registeredCalls: [],
        params: null,
        isSafePath: function (path) {
            return !(/["<>#%{}|^~\[\]`\\]/g.test(path));
        },
        getCookieName: function (params) {
            var cookieName = params.sourceContentPath || "inline-content";

            //name cookie with requested path allowing separate dismissal cookies for each unique path, remove characters not allowed in cookie name (though most aren't allowed in path either)
            return "NWSDisplayBannerClosed" + cookieName.replace(/[()<>@,;:\\"\[\]?={}\/]/g, "-");
        },
        getLastClosed: function (params) {
            //name cookie with the request path and -Last-Closed, this will indicate when the banner was last closed it and compare to the publish date
            var cookieName = _.getCookieName(params) + "-Last-Closed";

            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${cookieName}=`);
            if (parts.length === 2)
                return parts.pop().split(';').shift();
        },
        readBannerSuccess: function (data, status, jqXHR) {
            var startBody = /<body/g.exec(data).index;
            var endBody = /<\/body>/g.exec(data).index + 7;
            data = data.substring(startBody, endBody);
            var $content = $(data).find(this.state.params.sourceContentSelector);
            if (!$content.length) {
                console.warn("No Site Message Content Found. Check sourceContentPath property.");
                return;
            }

            if (typeof this.state.params.suppressIfContentIsEmpty !== "undefined" && this.state.params.suppressIfContentIsEmpty === true) {
                if ($content.text() === '') {
                    console.log('Content empty and suppress enabled. Display aborted.');
                    return;
                }
            }

            _.displayBanner($content, this.state.params);
        },
        displayBanner: function ($content, params) {
            var closeButtonContent = params.closeButtonContent || "<button type='button' class='close'><span class='screenReaderOnly'>Close Message</span></button>";

            var cookieName = _.getCookieName(params);
            params['cookieName'] = cookieName;

            var lastUpdated = cookieName + "-Last-Closed";
            params['lastClosed'] = lastUpdated;

            if (typeof params.wrapper !== "undefined") $content = $(params.wrapper).last().append($content);
            var $closeButton = $(closeButtonContent).on('click', params, function (e) { NWS.Display.Banner.closeModal(e); });

            $content = $(`<div class='NWSDisplayBannerMessage ${params.messageClass ?? ''}'></div>`).append($closeButton).append($content);
				  let $contentContainer;
					if (params.insertLocation === "modal" && params.modalShortLabel) {
						$contentContainer = $("<div role='dialog' aria-label='" + params.modalShortLabel + "' class='NWSDisplayBanner'></div>").append($content);
					}
					if (params.modalShortLabel) {
						$contentContainer = $("<div role='dialog' aria-label='" + params.modalShortLabel + "' class='NWSDisplayBanner'></div>").append($content);
					}
					else {
						$contentContainer = $("<div class='NWSDisplayBanner'></div>").append($content);
}

      			var $openPanelButton = $("<span class='Button openPanel'><a href='#'><span>" + params.openPanelName + "</span></a></span>").on('click',params,function(e){			
      				if (typeof params.togglePanel !== "undefined") {
      					NWS.Display.Banner.togglePanel(e);
      				}
      				else {
      					 NWS.Display.Banner.openPanel(e);
      				}			
      			});           

            let registerEscapeKey = false;
            switch (params.insertLocation) {
                case "lastChild":
                    $(params.bannerContainerSelector).append($contentContainer);
                    break;
                case "firstChild":
                    $(params.bannerContainerSelector).prepend($contentContainer);
                    break;
                case "afterContainer":
                    $(params.bannerContainerSelector).after($contentContainer);
                    break;
                case "beforeContainer":
                    $(params.bannerContainerSelector).before($contentContainer);
                    break;
                case "animate":
                    $contentContainer.addClass(`NWSDisplayBannerPanel animated ${params.animation.initialAnimation ?? ''}`);
					          $("footer").append($contentContainer);

                    if (typeof params.triggerLocationSelectorAfter !== "undefined") {
                        $(params.triggerLocationSelectorAfter).after($openPanelButton);
                    } else {
                        $contentContainer.before($openPanelButton);
                    }

                    registerEscapeKey = true;
                    
                    break;
                default:
                    $contentContainer.addClass(`NWSDisplayBannerModal ${params.modalClass ?? ''}`);
                    $contentContainer.find("a[modalIgnoreClick!='true']").on('click', params, function (e) { NWS.Display.Banner.closeModal(e); });
                    $("footer").append($contentContainer);
				
					if (typeof params.focusElement !== "undefined") {
						$(params.focusElement).focus();
					} else {
						$contentContainer.find(".NWSDisplayBannerMessage .close").focus();
					}

                    // Ensure LazyImages is loaded, then call LazyLoad to ensure any images within our modals are loaded
                    if (!NWS.Display || !NWS.Display.LazyImages) {
                        NWS.Modules.Register(["/CommonScripts/NWS/Modules.CommonScripts/NWS.Display.LazyImages.js"], function () {
                            NWS.Display.LazyImages.init();
                        })
                    } else {
                        NWS.Display.LazyImages.init();
                    }

                    registerEscapeKey = true;
                    break;
            }

            if (registerEscapeKey && (typeof params.modalPreventEscKeyClose == "undefined" || params.modalPreventEscKeyClose == false)) {
                $(document).on('keydown', params, function (e) { // accessibility - esc key - to close modal
                    if (e.key === 'Escape' || e.keyCode === 27)
                        NWS.Display.Banner.closeModal(e);                
                });
            }

        },
        beforeReadBanner: function (jqXHR, data) {

        },
        readBannerComplete: function (jqXHR, status) {
        },
        readBannerError: function (jqXHR, status, errorThrown) {
            console.warn("Error returned from source content page.  Check sourceContentPath.  Error Code: " + jqXHR.status);
        }
    }

    return {
		initBanner: function(params) {
			//register that this call has occured or log it if it hasn't
            if (_.registeredCalls.filter(function (call) { return call == _.getCookieName(params); }).length) {
                console.log("Banner is already added to page");
                return;
            }

            _.registeredCalls.push(_.getCookieName(params));

            if (typeof params.sourceContent === "undefined") {
                $.ajaxSetup({ cache: false });
                $.ajax({
                    url: params.sourceContentPath,
                    type: 'GET',
                    data: null,
                    dataType: 'html',
                    error: params.readBannerError || _.readBannerError,
                    state: { params: params },
                    beforeSend: params.beforeReadBanner || _.beforeReadBanner,
                    success: params.readBannerSuccess || _.readBannerSuccess,
                    complete: params.readBannerComplete || _.readBannerComplete
                });
            } else {
                _.displayBanner($(params.sourceContent), params);
            }
		},
        init: function (params) {
            params['insertLocation'] = params.insertLocation || "modal";
            if (!params
                || (typeof params.sourceContentPath === "undefined" && typeof params.sourceContent === "undefined")
                || (params.sourceContent === "undefined" &&
                    (params.sourceContentPath.charAt(0) !== "/"
                        || typeof params.sourceContentSelector === "undefined")
                )
                || (typeof params.bannerContainerSelector === "undefined"
                    && params.insertLocation != "modal")
                || (typeof params.animation === "undefined"
                    && params.insertLocation == "animate")
            ) {
                console.log("Correct parameters missing. Library loaded, nothing to display.");
                return;
            }
            if (typeof params.sourceContent === "undefined" && !_.isSafePath(params.sourceContentPath)) {
                console.error("Unsafe source content path.  Do not use \" < > # % { } | \ ^ ~ [ ] `");
                return;
            }
            var cookieCheck = _.getCookieName(params) + "=1";
            var isModal = params.insertLocation === "modal";
            var rememberClose = (typeof params.rememberClose !== "undefined") ? params.rememberClose : isModal;
            var lastClosed = _.getLastClosed(params);

            if (typeof params.sourceContentPath !== "undefined" && params.sourceContentPath.trim() !== '') {
                // If we are looking somewhere else for the banner content, get its publish date
                NWS.Display.DocumentSupport.GetPublishDate(params.sourceContentPath, function (data) {

                    var overrideRememberClose = false;
                    if (data === "") {
                        // if something is hidden or unpublished we don't want to show it
                        return;
                    }

                    // if there's no last updated cookie, remember close preference
                    var lastPublishDate = new Date(data).toISOString();
                    if (lastPublishDate > lastClosed)
                        overrideRememberClose = true;

                    if (rememberClose && document.cookie && document.cookie.indexOf(cookieCheck) > -1 && !overrideRememberClose)
                        return; /* user has banner closed cookie */

                    NWS.Display.Banner.initBanner(params);
                });
            }
            else {
                // Simply display
                NWS.Display.Banner.initBanner(params);
            }
            
        },
        closeModal: function (e) {
            //if user hit escape e.currentTarget will be the document object and .closest doesn't exist
            let bannerToClose;
            if (e.currentTarget instanceof Element)
                bannerToClose = e.currentTarget.closest(".NWSDisplayBanner"); 
            
            //If it's a panel with an animate class, set the animate out class.  Otherwise it's a model or normal banner and just hide it.
            //If we don't have a bannerToClose target, the user hit escape button.  Fall back to closing all of the open items for this type of modal
            if (bannerToClose && bannerToClose.classList.contains(e.data?.animation?.animateInClass ?? ''))
                $(bannerToClose).addClass(e.data.animation.animateOutClass).removeClass(e.data.animation.animateInClass);
            else if (bannerToClose)
                $(bannerToClose).hide();          
            else {
                if (typeof e.data.animation !== "undefined" && $('div.NWSDisplayBannerPanel').hasClass(e.data.animation.animateInClass))
                    $('div.NWSDisplayBannerPanel').addClass(e.data.animation.animateOutClass).removeClass(e.data.animation.animateInClass);            
                else
                    $("div.NWSDisplayBannerModal").hide();               
            }

            // If we presented the user with a modal and wish to enforce an "Accept" action on, and they've cancelled out
            // don't set our closed cookies so the user is confronted with the modal again -JM
            if (typeof e.data.modalCancelButtonId !== "undefined" && (e.data.modalCancelButtonId == e.currentTarget.id || e.keyCode == '27'))
                return;

            document.cookie = e.data.cookieName + "=1;path=/";
            // set a closed date when the user has closed the banner, this will show the banner again
            // if the banner has been recently republished after this date
            document.cookie = e.data.lastClosed + "=" + new Date().toISOString() + ";path=/";
            if ($('.openPanel a').length) {
                $('.openPanel a').focus();
            }
        },
        openPanel: function (e) {
            e.preventDefault();
            if (typeof e.data.animation !== "undefined") {
                $('div.NWSDisplayBannerPanel').addClass(e.data.animation.animateInClass).removeClass(e.data.animation.animateOutClass);
            }
            $('div.NWSDisplayBannerPanel').show();
            if (typeof e.data.focusElement !== "undefined") {
                $(e.data.focusElement).focus();
            } else {
                $('div.NWSDisplayBannerPanel .NWSDisplayBannerMessage .close').focus();
            }
		},
		togglePanel:function(e){
			e.preventDefault();
			if(typeof e.data.animation !== "undefined") {
				var panel = $('div.NWSDisplayBannerPanel');
				if(panel.hasClass(e.data.animation.animateInClass)) {
					panel.addClass(e.data.animation.animateOutClass).removeClass(e.data.animation.animateInClass);
				}
				else {
					panel.addClass(e.data.animation.animateInClass).removeClass(e.data.animation.animateOutClass);					
				}
			}
		}
	 }
});


NWS.initNamespace('NWS.Display.CollapseContent', function () {

    var _params;

    function getContentElement(trigger) {
        var parentWrapper = trigger.closest('.' + _params.wrapperClass);
        if (parentWrapper) return parentWrapper;

        var stripe = trigger.closest('.TitanBlock');
        if (!stripe) return null;

        var triggers = Array.from(stripe.querySelectorAll(_params.triggerClass));
        var contents = Array.from(stripe.querySelectorAll('.' + _params.wrapperClass));

        var index = triggers.indexOf(trigger);
        return contents[index] || null;
    }

    // find the correct "View more" trigger for a wrapper
    function getTopTriggerForContent(content) {

        var stripe = content.closest('.TitanBlock');
        if (!stripe) return null;

        var triggers = Array.from(stripe.querySelectorAll(_params.triggerClass))
            .filter(function (t) {
                return !t.classList.contains('CollapseEndTrigger');
            });

        for (var i = 0; i < triggers.length; i++) {

            if (getContentElement(triggers[i]) === content) {
                return triggers[i];
            }

        }

        return null;
    }

    function syncTriggers(content, isOpen) {
        var stripe = content.closest('.TitanBlock');
        if (!stripe) return;

        stripe.querySelectorAll(_params.triggerClass).forEach(function (el) {
            var elContent = getContentElement(el);
            if (elContent === content) {
                el.classList.toggle('open', isOpen);
                el.setAttribute('aria-expanded', isOpen.toString());
                toggleLabelVisibility(el, isOpen);
            }
        });
    }

    function toggleLabelVisibility(trigger, isOpen) {

        // bottom trigger always shows "View Less"
        if (trigger.classList.contains('CollapseEndTrigger')) return;

        var collapsed = trigger.querySelector('.collapsed');
        var open = trigger.querySelector('.open');

        if (collapsed) {
            collapsed.style.display = isOpen ? 'none' : '';
        }

        if (open) {
            // hide "View Less" on top trigger
            open.style.display = 'none';
        }
    }

    function setFocusToContent(content) {

        if (!content.hasAttribute('tabindex')) {
            content.setAttribute('tabindex', '-1');
        }

        content.focus({ preventScroll: false });
    }

    function setClickHandler(trigger) {

        var content = getContentElement(trigger);
        if (!content) return;

        var isEndTrigger = trigger.classList.contains('CollapseEndTrigger');
        var isOpen = trigger.classList.contains('open');

        if (isEndTrigger || isOpen) {

            syncTriggers(content, false);

            // determine the correct top trigger before collapsing
            var topTrigger = getTopTriggerForContent(content);

            setTimeout(function () {
                content.style.display = 'none';

                // return focus to the correct "View more"
                if (topTrigger) {
                    topTrigger.focus({ preventScroll: false });
                }

            }, 150);

        } else {

            if (_params.collapseOthers) {

                var stripe = trigger.closest('.siteBounds');

                stripe.querySelectorAll('.' + _params.wrapperClass).forEach(function (el) {
                    el.style.display = 'none';
                });

                stripe.querySelectorAll(_params.triggerClass).forEach(function (el) {
                    el.classList.remove('open');
                    el.setAttribute('aria-expanded', 'false');
                    toggleLabelVisibility(el, false);
                });
            }

            content.style.display = 'block';

            syncTriggers(content, true);

            // Move focus into expanded content
            // allow screen readers to announce expanded first
            setTimeout(function () {
                setFocusToContent(content);
            }, 150);
        }

        if (typeof _params.callback === "function") {
            _params.callback();
        }
    }

    function wrapContent(stripe) {

        var contents = stripe.querySelectorAll(_params.contentClass);

        contents.forEach(function (content) {

            var parent = content.parentElement;

            if (!parent.classList.contains(_params.wrapperClass)) {

                var wrapper = document.createElement('div');
                wrapper.className = _params.wrapperClass;

                parent.insertBefore(wrapper, content);
                wrapper.appendChild(content);
            }
        });
    }

    function createEndTrigger(wrapper) {

        if (wrapper.querySelector('.CollapseEndTrigger')) return;

        var trigger = document.createElement('p');

        trigger.className = _params.triggerClass.replace('.', '') + ' CollapseEndTrigger';

        trigger.innerHTML = `<span class="open">View Less</span>`;

        wrapper.appendChild(trigger);

        initializeTrigger(trigger);
    }

    function initializeTrigger(trigger) {

        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('tabindex', '0');

        if (!trigger.classList.contains('CollapseEndTrigger')) {
            toggleLabelVisibility(trigger, false);
        }

        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            setClickHandler(trigger);
        });

        trigger.addEventListener('keydown', function (e) {

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setClickHandler(trigger);
            }

        });
    }

    return {

        init: function (params) {

            _params = params;

            if (!_params.triggerClass)
                throw 'params.triggerClass must be defined';

            if (!_params.contentClass)
                throw 'params.contentClass must be defined';

            if (!_params.wrapperClass)
                _params.wrapperClass = 'CollapseInnerWrapper';

            NWS.CommonScripts.ModuleManager.OnPageShow(function () {

                document.querySelectorAll('.TitanBlock').forEach(function (stripe) {

                    wrapContent(stripe);

                    var wrappers = stripe.querySelectorAll('.' + _params.wrapperClass);

                    wrappers.forEach(function (wrapper) {

                        createEndTrigger(wrapper);

                        wrapper.style.display = 'none';
                    });

                    var triggers = stripe.querySelectorAll(_params.triggerClass);

                    triggers.forEach(function (trigger) {

                        if (!trigger.hasAttribute('data-collapse-init')) {

                            initializeTrigger(trigger);

                            trigger.setAttribute('data-collapse-init', 'true');
                        }

                    });

                });

            });

        }

    };

});
NWS.initNamespace("NWS.Display.DocumentSupport", function () {

    return {

        GetPublishDate: function (path, callback) {

            $.ajaxSetup({ cache: false });
            $.ajax({
                url: "/NWS/Modules.CommonScripts/DocumentSupport/GetPublishDate?path=" + path,
                type: 'GET'
            })
                .done(function (data) {
                    if (typeof (callback) === "function")
                        callback(data);
                });
        }
    }

});
NWS.initNamespace('NWS.Display.Utilities',function(){

	var _ = {
		params: null,
		toggleAriaExpanded: function (i, attr) { return attr == 'true' ? 'false' : 'true' }
	}
	return {
		init: function (params) {
            _.params = params || {};

			NWS.CommonScripts.ModuleManager.OnPageShow(function() {
				let sideNavConfig = {
					triggerSelector: "#sideNavCollapse",
					collapseElementSelector: "#sideNavWrapper"
				}
				NWS.Display.Utilities.KeyboardToggle(sideNavConfig);
				NWS.Display.Utilities.KeyboardToggle(_.params.keyboardCollapseConfig);
				NWS.Display.Utilities.InitClickWholeCard(_.params.clickCardConfig);
				NWS.Display.Utilities.AccessibleBlockTabs(_.params.accessibleBlockTabsConfig);
				
				var ajaxBlocks = [NWS.Block.Aggregation, NWS.Block.DataList, NWS.Block.SegmentedSearch].filter(function (blockNS) { 
					return typeof blockNS !== "undefined"; 
				});
				ajaxBlocks.forEach(function(blockNS) {
					blockNS.OnAjaxComplete("clickWholeCard", function(){
						NWS.Display.Utilities.InitClickWholeCard(_.params.clickCardConfig);
					});
				});

			});
		},
		InitClickWholeCard: function (clickCardConfig) {
			if (!clickCardConfig || !clickCardConfig.elementSelector)
				return;
			let cardConfig = clickCardConfig
			$(clickCardConfig.elementSelector).each(function(){
				let item = $(this);
				let linkParameter = item.find('a')[0];
				if (linkParameter) {
					
					item.css('cursor','pointer').off().on('click',function(){
						if(!$(event.target).is(linkParameter))
							linkParameter.click();
					});
					
					if (cardConfig.newClass)
					item.addClass(cardConfig.newClass);
				}
			});
			
		},
		KeyboardToggle: function (keyboardCollapseConfig) {
			if (!keyboardCollapseConfig || !keyboardCollapseConfig.triggerSelector)
				return;
			let $collapseElement = $(keyboardCollapseConfig.collapseElementSelector);

			$(keyboardCollapseConfig.triggerSelector).on('keypress', function (e) {
				let keyCode = e.which;
				if (keyCode == 13) { // the enter key code
					e.preventDefault();
					$collapseElement.toggle();
					const aria = $(this).attr('aria-expanded');
					if (typeof aria !== 'undefined' && aria !== false)
					$(this).attr('aria-expanded', _.toggleAriaExpanded);
				}
			});
		},
		AccessibleBlockTabs: function (config) {
			if (!config || !config.containerClass) return;

			const wrappers = document.querySelectorAll(config.containerClass);
			if (!wrappers.length) return;

			const mq = window.matchMedia('(max-width: 1024px)');
			const isMobile = function () { return mq.matches; };

			wrappers.forEach(function (wrapper, wrapperIndex) {
				const tabListNav = wrapper.querySelector(config.tabListSelector);
				const tabs = wrapper.querySelectorAll(config.tabSelector);
				const panels = wrapper.querySelectorAll(config.panelSelector);

				if (!tabListNav || !tabs.length || !panels.length) return;

				tabs.forEach(function (tab, index) {
					const panel = panels[index];
					const uniqueID = 'section-idx-' + wrapperIndex + '-' + index;
					const tabID = 'tab-control-' + wrapperIndex + '-' + index;

					tab.setAttribute('id', tabID);
					tab.setAttribute('data-target', uniqueID);
					tab.setAttribute('aria-controls', uniqueID);

					panel.setAttribute('id', uniqueID);
					panel.setAttribute('aria-labelledby', tabID);

					tab.addEventListener('click', function (e) {
						if (isMobile()) {
							e.preventDefault(); 
							const targetPanel = document.getElementById(tab.getAttribute('data-target'));
							if (targetPanel) {
								targetPanel.setAttribute('tabindex', '-1');
								targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
								
								setTimeout(function () {
									targetPanel.focus();
								}, 150);
							}
						} else {
							setActiveTab(index);
						}
					});

					tab.addEventListener('keydown', function (e) {
						if (isMobile()) return; 

						let newIndex = null;
						if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
							newIndex = (index + 1) % tabs.length;
						} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
							newIndex = (index - 1 + tabs.length) % tabs.length;
						} else if (e.key === 'Home') {
							newIndex = 0;
						} else if (e.key === 'End') {
							newIndex = tabs.length - 1;
						}

						if (newIndex !== null) {
							e.preventDefault();
							tabs[newIndex].focus();
							setActiveTab(newIndex);
						}
					});
				});

				function setActiveTab(index) {
					tabs.forEach(function (tab, i) {
						const isActive = i === index;
						const panel = panels[i];

						if (isMobile()) {
							tab.setAttribute('tabindex', '0');
							tab.setAttribute('role', 'link'); 
							tab.removeAttribute('aria-selected');
							
							panel.style.display = 'block';
							panel.removeAttribute('aria-hidden');
						} else {
							tab.setAttribute('role', 'tab'); 
							tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
							tab.setAttribute('tabindex', isActive ? '0' : '-1');
							
							panel.setAttribute('role', 'tabpanel');
							panel.style.display = isActive ? 'block' : 'none';
							panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
							panel.removeAttribute('tabindex'); 
						}
					});
				}

				const handleRefresh = function () {
					if (isMobile()) {
						tabListNav.removeAttribute('role'); 
						tabListNav.setAttribute('aria-label', 'In-page quick navigation links');

						panels.forEach(function (p) {
							p.removeAttribute('role');
							p.style.display = 'block';
							p.removeAttribute('aria-hidden');
						});
						
						tabs.forEach(function (t) { 
							t.setAttribute('tabindex', '0'); 
							t.setAttribute('role', 'link'); 
							t.removeAttribute('aria-selected');
						});
					} else {
						tabListNav.setAttribute('role', 'tablist');
						tabListNav.removeAttribute('aria-label');

						let activeIdx = -1;
						tabs.forEach(function (t, i) {
							if (t.getAttribute('aria-selected') === 'true') {
								activeIdx = i;
							}
						});
						
						panels.forEach(function (p) { p.removeAttribute('tabindex'); });
						setActiveTab(activeIdx === -1 ? 0 : activeIdx);
					}
				};

				if (mq.addEventListener) {
					mq.addEventListener('change', handleRefresh);
				} else if (mq.addListener) {
					mq.addListener(handleRefresh); 
				}
				
				handleRefresh();
			});
		}
	};
});
NWS.initNamespace('NWS.Display.Animation', function () {
    var _ = {
        params: null
    }    
	function activateVisible(e, selector, offset, callback)
	{
		var listSelector, visibleOffset, postActivateCallback;
		visibleOffset = 0;
		if(typeof(selector) !== "undefined") 
			listSelector = selector;
		else if(e && typeof(e.data) !== "undefined" && typeof(e.data.animateSelector) !== "undefined")
			listSelector = e.data.animateSelector;
		else 
			return;
		
		if(typeof(offset) !== "undefined") 
			visibleOffset = offset;
		else if(e && typeof(e.data) !== "undefined" && typeof(e.data.visibleOffset) !== "undefined")
			visibleOffset = e.data.visibleOffset;
		
		postActivateCallback = null;
		if(typeof(callback) === "function")
			postActivateCallback = callback;
		else if(e && typeof(e.data) !== "undefined" && typeof(e.data.callback) !== "undefined")
			postActivateCallback = e.data.callback;
		
		$(listSelector).not('.animated').each(function() {
				var $element = $(this);
				var $window = $(window);
				if(($window.scrollTop() + $window.height()) > ($element.offset().top + visibleOffset))
				{
					$element.addClass("animated");
					if(postActivateCallback)
						postActivateCallback(this);
				}	
				});
	}
	
    return {
        init: function (params) {
            _.params = params;
            NWS.Display.Animation.AnimateBlocks(_.params.selector, _.params.visibleOffset, _.params.callback);
        },
        AnimateBlocks: function (selector, visibleOffset, callback) {
            activateVisible(null, selector, visibleOffset, callback);
            $(window).on('scroll', { 'animateSelector': selector, 'visibleOffset': visibleOffset, 'callback': callback }, activateVisible);
        },
		RecheckVisible: function () {
			if (_.params) {
				activateVisible(null, _.params.selector, _.params.visibleOffset, _.params.callback);
			}
		}
    };
});



NWS.initNamespace('NWS.Display.LazyImages',function(){
	var _ = {
		loadImage: function(entry, callback) {
			var lazyImage = entry.target;
			var selectorClass = _.params.selectorClass || "lazy";
			var fadeInClass = _.params.fadeInClass || "lazy-fadeIn";
					var loadCallback = function() {
				lazyImage.classList.add(fadeInClass);
				if(typeof callback === "function")
					callback();
					};
					if(lazyImage.complete && lazyImage.naturalHeight !== 0)
						loadCallback();
					else {
						lazyImage.addEventListener('load', loadCallback);
					}
					
			if (lazyImage.getAttribute("data-src")) {
				lazyImage.src = lazyImage.getAttribute("data-src");
			}
			if (lazyImage.getAttribute("data-srcset")) {
				lazyImage.srcset = lazyImage.getAttribute("data-srcset");
			}
			if (lazyImage.getAttribute("data-alt")) {
				lazyImage.alt = lazyImage.getAttribute("data-alt");
			}
			lazyImage.classList.remove(selectorClass);
		},
				addSelectorClass: function(selector){
					var selectorClass = _.params.selectorClass || "lazy";
					var lazyImages = document.querySelectorAll(selector); 
						
					for(var i=0; i<lazyImages.length;i++) {
						if(!lazyImages[i].classList.contains(selectorClass))
							lazyImages[i].classList.add(selectorClass);
					}
				}
    }
	
	return {		 
		init: function (params) {
			_.params = params || {};			
			var domLoaded = function(){
				//add selector class to any images defined with data-src
				_.addSelectorClass("img[data-src]");
				
				var ajaxBlocks = [NWS.Block.Aggregation, NWS.Block.DataList, NWS.Block.SegmentedSearch].filter(function (blockNS) { return typeof blockNS !== "undefined"; });
				ajaxBlocks.forEach(function (blockNS) { blockNS.OnAjaxComplete("LazyLoadImages", NWS.Display.LazyImages.LazyLoad); });
                
				NWS.Display.LazyImages.LazyLoad();
			};
			
			//dom observer is required, if not loaded will need to load
			if(!NWS.Display || !NWS.Display.DOMObserver) {
				NWS.Modules.Register(["/CommonScripts/NWS/Modules.CommonScripts/NWS.Display.DOMObserver.js"], function() {
					//possible init called after domcontentloaded event
					if(document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive")
						domLoaded();
					else
						window.addEventListener("DOMContentLoaded", domLoaded);
				});
			}
			else {
				//possible init called after domcontentloaded event
				if(document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive")
					domLoaded();
				else
					window.addEventListener("DOMContentLoaded", domLoaded);
			}
		},
		LazyLoad: function() {
			var selectorClass = _.params.selectorClass || "lazy";
			NWS.Display.DOMObserver.AddIntersectionObserver("img." + selectorClass, function(entry){ _.loadImage(entry, _.params.callback); }, null,  null, null,true);
		}		
	};
});

// missing forEach on NodeList for IE11
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = Array.prototype.forEach;
}
NWS.initNamespace('NWS.Display.ScrollContainer', function () {

    // Private variable for this namespace
    var _params;

    function addScrollText($wrappers) {
        $wrappers.each(function () {
            if (hasHorizontalScrollBar($(this))) {
                $(this).prev('.' + _params.scrollTextClass).show();
            } else {
                $(this).prev('.' + _params.scrollTextClass).hide();
            }
        });
    }

    function hasHorizontalScrollBar(el) {
		return el.get(0).scrollWidth > el.innerWidth() + 1;
    }
	
    function addKeyboardControls($wrappers) {
        $wrappers.each(function () {
            var $wrapper = $(this);
            
			// Check if horizontal scrolling is needed
			var needsHorizontalScroll = function() {
				var element = $wrapper.get(0);
				return element.scrollWidth > element.clientWidth;
			};			
			var updateTabindex = function() {
				if (needsHorizontalScroll()) {
					if (!$wrapper.attr('tabindex')) {
						$wrapper.attr('tabindex', '0');
					}
				} else {
					$wrapper.removeAttr('tabindex');
				}
			};			
			updateTabindex();
			$(window).off('resize.scrollcontainer' + $wrapper.index()).on('resize.scrollcontainer' + $wrapper.index(), function() {
				updateTabindex();
			});
            
            // Add keyboard event handler
            $wrapper.off('keydown.scrollcontainer').on('keydown.scrollcontainer', function (e) {
                var scrollAmount = _params.scrollAmount || 50;
                var currentScroll = $wrapper.scrollLeft();
                
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        $wrapper.scrollLeft(currentScroll - scrollAmount);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        $wrapper.scrollLeft(currentScroll + scrollAmount);
                        break;
                    case 'Home':
                        e.preventDefault();
                        $wrapper.scrollLeft(0);
                        break;
                    case 'End':
                        e.preventDefault();
                        $wrapper.scrollLeft($wrapper.get(0).scrollWidth);
                        break;
                }
            });
            
            $wrapper.off('focus.scrollcontainer').on('focus.scrollcontainer', function () {
                $(this).addClass('scroll-container-focused');
            });
            
            $wrapper.off('blur.scrollcontainer').on('blur.scrollcontainer', function () {
                $(this).removeClass('scroll-container-focused');
            });
        });
    }

    return {
        /**
         * Creates a horizontal scrolling container around an element. This is designed primarily for tables, but could be used for other elements
         * @param {Object} params - An object containing the parameters
         * @param {Object} params.element - Required. The element to scroll. This can be a DOM element, a jQuery element, or a jQuery selector
         * @param {string} params.scrollText - Optional. The text that appears above the element
         * @param {string} params.scrollTextClass - Optional. The class name that appears around the text above the element
         * @param {string} params.containerClass - Optional. The class name for the container around the element
         */
        init: function (params) {
            _params = params;

            // Required parameters
            if (typeof (_params.element) === 'undefined')
                throw 'params.element must be defined';

            // Convert DOM element to jQuery element if needed
            if (!(_params.element instanceof jQuery))
                _params.element = $(_params.element);
			
            // Optional parameters
            if (typeof (_params.scrollText) === 'undefined')
                _params.scrollText = 'Scroll table to view all';
            if (typeof (_params.scrollTextClass) === 'undefined')
                _params.scrollTextClass = 'scrollText';
            if (typeof (_params.containerClass) === 'undefined')
                _params.containerClass = 'scrollTable';
            if (typeof (_params.enableKeyboard) === 'undefined')
                _params.enableKeyboard = true;

                _params.element.wrap('<div class="' + _params.containerClass + '"/>');
                var $wrappers = $('.' + _params.containerClass);
                $('<div class="' + _params.scrollTextClass + '">' + _params.scrollText + '</div>').insertBefore($wrappers);

                addScrollText($wrappers);

				// Add keyboard controls if enabled
				if (_params.enableKeyboard) {
					addKeyboardControls($wrappers);
				}

				$(window).resize(function () {
					addScrollText($wrappers);
				});
        }
    };
});

// If this moves into base and needs to keep the same naming pattern used by base, this alias could be added:
// NWS.initNamespace('NWS.Display.InitScrollContainer', NWS.Display.ScrollContainer.init);

NWS.initNamespace('NWS.Display.Slick', function () {
	var _ = {
		params: null
		
	}
    // This doesn't store params at all, allowing this to easily be called multiple times on one page

    return {		
        /**
         * Creates smoothe sliding panels - can be used for menus, filters or anything you want to slide in and out
         * @param {Object} params - An object containing the parameters
         * @param {string} params.openButton - Optional. An element that will open the sliding panel when clicked. This can be a DOM element, a jQuery element, or a jQuery selector
         * @param {string} params.closeButton - Optional. An element that will close the sliding panel when clicked. This can be a DOM element, a jQuery element, or a jQuery selector
         * @param {Object} params.panel - Optional. An element that is the sliding panel. This can be a DOM element, a jQuery element, or a jQuery selector
         * @param {string} params.direction - Optional. The direction you want the panel to slide from
         */

		init: function (params) {        
			_.params = params;
			 
			if(!_.params || typeof(_.params.selector) === "undefined")
				  return;
			
			/* SLICK SLIDER TESTIMONIALS AND CASE STUDIES */                                
			var $sliderSelector = $(_.params.selector);
			
			// solve the bfacche problem: If the slider already exists, destroy it and unwrap any previous grouping divs
            if ($sliderSelector.hasClass('slick-initialized')) {
                $sliderSelector.slick('unslick');
                
                if ($(".slider", $sliderSelector).length) {
                    $("> .slider", $sliderSelector).children().unwrap();
                }
                if ($(".slickContainer", $sliderSelector).length) {
                    $(".slick-list", $sliderSelector).unwrap();
                }
            }

			if(!$(".TitanBlock", $sliderSelector).length)
				return;

			/* count feature image and feature text blocks */
			var totalFeatureImage = $(':is(.FeatureImage, .FeatureMedia)', $sliderSelector).length
			var totalFeatureText = $('.FeatureText', $sliderSelector).length

			/* group feaure text and feature images together if equal */
			if(totalFeatureImage == totalFeatureText) {
				var slides = $("> .TitanBlock", $sliderSelector);
				for(var i = 0; i < slides.length; i+=2) {
					slides.slice(i, i+2).wrapAll("<div class='slider'/>");
				}
			}
			else if (totalFeatureImage > totalFeatureText){
				/* wrap feature image blocks */
				$(':is(.FeatureImage, .FeatureMedia)', $sliderSelector).wrap("<div class='slider'/>");
			}
			else if (totalFeatureImage < totalFeatureText){
				/* wrap feature text blocks */
				$('.FeatureText', $sliderSelector).wrap("<div class='slider'/>");
			}
			
			var slickInitOptions = {
				slide: '.slider',
				arrows: false,
				dots: true,
				fade: true,
				adaptiveHeight: true,
				lazyLoad: 'ondemand',
				autoplaySpeed: 5000,
				speed: 500,
				rows:0
			};

			/* init slider */
			if(typeof _.params.slickInitOptions !== "undefined") 
			slickInitOptions = _.params.slickInitOptions;
			$sliderSelector.on('init').slick(slickInitOptions);

			/* place slider below feature text */
			if( totalFeatureImage > totalFeatureText) {
				$('.slick-list', $sliderSelector).wrap("<div class='slickContainer'/>");
			}
			
			/* autoplay for Edge */	
			$(':is(.FeatureImage, .FeatureMedia) video', $sliderSelector).trigger('play');
		}
	}
});

// If this moves into base and needs to keep the same naming pattern used by base, this alias could be added:
// NWS.initNamespace('NWS.Display.InitSmoothAnchors', NWS.Display.SmoothAnchors.init);

/* - named anchors --------------------------------------------------------- */
NWS.initNamespace('NWS.Display.SmoothAnchors',function(){

    // Private variable for this namespace
    var _params;

	function setClickHandler(exceptions){
		$('a[href*="#"]').on('click',function(e){
			if($(this).attr('href') == '#' || $(this).is(exceptions) )
				return;
			if(location.pathname.replace(/^\//,'') != this.pathname.replace(/^\//,'') && location.hostname != this.hostname)
				return;
			animatedScrollToTarget(getHashTarget(this.hash), "html,body", { scrollOffset:  getPageTopDifference() }, 
				function(targetSelector, scrollContainerSelector, options){
					adjustForHeaderChange(targetSelector, scrollContainerSelector, options) 
				}

			);
		});                       
	}
	
	function scrollOnPageLoad(){
		setTimeout(function() { 
							animatedScrollToTarget(getHashTarget(location.hash), "html,body", { scrollOffset:  getPageTopDifference() }, 
								function(targetSelector, scrollContainerSelector, options){
									adjustForHeaderChange(targetSelector, scrollContainerSelector, options) 
								}
						) }, 500);
	}
	
	function adjustForHeaderChange(targetSelector, scrollContainerSelector, options) {
		_params.pageTopVariableHeight = $(_params.fixedHeader).outerHeight();
		if(options.scrollOffset != getPageTopDifference())
			animatedScrollToTarget(targetSelector, scrollContainerSelector, { scrollOffset:  getPageTopDifference(), scrollSpeed:0 });
	}
	
	function getHashTarget(hash) {
		if (hash == '')
			return;
		
		if ($('a[name=' + hash.slice(1) +']').length)
			return 'a[name=' + hash.slice(1) +']';
		else
			return '[id=' + hash.slice(1) +']';
	}
	
	function getPageTopDifference() {
			if($(_params.fixedHeader).css('position') != 'fixed')
				return  _params.pixelDifference;
			else if (typeof(_params.pageTopHeight) === 'undefined')
				return _params.pageTopVariableHeight + _params.pixelDifference;
			else
				return _params.pageTopHeight + _params.pixelDifference;
	}
	
	function animatedScrollToTarget(targetSelector, scrollContainerSelector, options, callback){			
			let scrollOffset = 0, scrollSpeed = _params.scrollSpeed;
			let target = $(targetSelector);
			if(target.length == 0)
				return;
			
			if(typeof(options) !== "undefined")
			{
				if(typeof(options.scrollOffset) !== "undefined")
					scrollOffset = options.scrollOffset;
				if(typeof(options.scrollSpeed) !== "undefined")
					scrollSpeed = options.scrollSpeed;				
			}
			if(typeof(scrollContainerSelector) !== "undefined")
				scrollContainerSelector = "html,body";
			
				// expand details element if anchor is inside it - needed for mobile browsers
				if ($(targetSelector).length){
				  if ($(targetSelector).is(":hidden")) {
					let details = $(targetSelector).closest("details");
					if (details) {
						details.prop("open", true);
					}
				  }
				}
			$(scrollContainerSelector).animate({
				 scrollTop: target.offset().top - scrollOffset
			}, scrollSpeed, function(){ 
					if(typeof(callback) === "function")
						callback(targetSelector, scrollContainerSelector, options) 
					});
	}	

	return {
        /**
         * @param {Object} params - An object containing the parameters
         * @param {Object} params.getHashTarget - Optional. A function used to get the target of a hash. This example will look for any element with an ID matching the hash (instead of looking for a named anchor): init({ getHashTarget: function(hash) { return $('[id=' + hash.slice(1) +']'); } });
         * @param {string} params.fixedHeader - Optional. Default value is '#pageTopArea'
         * @param {string} params.scrollSpeed - Optional. Default value is 500.
         * @param {string} params.pageTopHeight - Optional. Default value is the height of the fixed header.
         * @param {string} params.pixelDifference - Optional. Default value is 0
         */
		init: function (params) {
			_params = params;
			
			if (typeof(_params.fixedHeader) === 'undefined')
				_params.fixedHeader = '#headerArea';
			if (typeof(_params.scrollSpeed) === 'undefined')
				_params.scrollSpeed = 500;
			if (typeof(_params.pageTopHeight) === 'undefined')
				params.pageTopVariableHeight = $(params.fixedHeader).outerHeight();
			if (typeof(_params.pixelDifference) === 'undefined')
				_params.pixelDifference = 15;
			if (typeof(_params.getHashTarget) === 'undefined')
				_params.getHashTarget = getHashTarget;

			setClickHandler(_params.exceptions);
			scrollOnPageLoad();
		}
	};
});
/*!
* FitVids 1.1
*
* Copyright 2013, Chris Coyier - http://css-tricks.com + Dave Rupert - http://daverupert.com
* Credit to Thierry Koblentz - http://www.alistapart.com/articles/creating-intrinsic-ratios-for-video/
* Released under the WTFPL license - http://sam.zoy.org/wtfpl/
*
*/
(function( $ ){
"use strict";
$.fn.fitVids = function( options ) {
var settings = {
customSelector: null,
ignore: null
};
if(!document.getElementById('fit-vids-style')) {
// appendStyles: https://github.com/toddmotto/fluidvids/blob/master/dist/fluidvids.js
var head = document.head || document.getElementsByTagName('head')[0];
var css = '.fluid-width-video-wrapper{width:100%;position:relative;padding:0;}.fluid-width-video-wrapper iframe,.fluid-width-video-wrapper object,.fluid-width-video-wrapper embed {position:absolute;top:0;left:0;width:100%;height:100%;}';
var div = document.createElement('div');
div.innerHTML = '<p>x</p><style id="fit-vids-style">' + css + '</style>';
head.appendChild(div.childNodes[1]);
}
if ( options ) {
$.extend( settings, options );
}
return this.each(function(){
var selectors = [
"iframe[src*='player.vimeo.com']",
"iframe[src*='youtube.com']",
"iframe[src*='youtube-nocookie.com']",
"iframe[src*='kickstarter.com'][src*='video.html']",
"object",
"embed"
];
if (settings.customSelector) {
selectors.push(settings.customSelector);
}
var ignoreList = '.fitvidsignore';
if(settings.ignore) {
ignoreList = ignoreList + ', ' + settings.ignore;
}
var $allVideos = $(this).find(selectors.join(','));
$allVideos = $allVideos.not("object object"); // SwfObj conflict patch
$allVideos = $allVideos.not(ignoreList); // Disable FitVids on this video.
$allVideos.each(function(){
var $this = $(this);
if($this.parents(ignoreList).length > 0) {
return; // Disable FitVids on this video.
}
if (this.tagName.toLowerCase() === 'embed' && $this.parent('object').length || $this.parent('.fluid-width-video-wrapper').length) { return; }
if ((!$this.css('height') && !$this.css('width')) && (isNaN($this.attr('height')) || isNaN($this.attr('width'))))
{
$this.attr('height', 9);
$this.attr('width', 16);
}
var height = ( this.tagName.toLowerCase() === 'object' || ($this.attr('height') && !isNaN(parseInt($this.attr('height'), 10))) ) ? parseInt($this.attr('height'), 10) : $this.height(),
width = !isNaN(parseInt($this.attr('width'), 10)) ? parseInt($this.attr('width'), 10) : $this.width(),
aspectRatio = height / width;
if(!$this.attr('id')){
var videoID = 'fitvid' + Math.floor(Math.random()*999999);
$this.attr('id', videoID);
}
$this.wrap('<div class="fluid-width-video-wrapper"></div>').parent('.fluid-width-video-wrapper').css('padding-top', (aspectRatio * 100)+"%");
$this.removeAttr('height').removeAttr('width');
});
});
};
// Works with either jQuery or Zepto
})( window.jQuery || window.Zepto );
