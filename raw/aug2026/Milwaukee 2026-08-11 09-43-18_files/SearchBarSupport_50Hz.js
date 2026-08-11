NWS.initNamespace("NWS.Blocks.SearchBar.Support", function () {
    // global params
    var searchTimer, suggestionTimer, terms, termsForQS;
    var highlights = [];
    var suggestionInterval = 500;
    var segmentsOn = false;
    var segmentInfo = {
        activeSegment: null,
        activeLinkParam: null,
        sourceID: null,
        targetID: null, 
		searchID: null
    };

    // Private functions
    var _ = {
        GetCurrentSegmentInfo: function (searchID) {
            let activeSegment = "";
            searchID = searchID || "";
			
            if (document.getElementById(searchID + 'hidActiveSegment'))
                activeSegment = document.getElementById(searchID + 'hidActiveSegment').value;
            if(!activeSegment.length && document.getElementById('hidActiveSegment')) //backward compatibility
                activeSegment = document.getElementById('hidActiveSegment').value;				
			if(!activeSegment.length && document.querySelector('input[id$="_hidActiveSegment"'))
		        activeSegment = document.querySelector('input[id$="_hidActiveSegment"]').value;				
			
			if(!activeSegment.length && document.getElementById(searchID + 'hidDefaultSegment'))
                activeSegment = document.getElementById(searchID + 'hidDefaultSegment').value;
			if(!activeSegment.length && document.getElementById('hidDefaultSegment')) //backward compatibility
		        activeSegment = document.getElementById('hidDefaultSegment').value;		
			if(!activeSegment.length && document.querySelector('input[id$="_hidDefaultSegment"'))
		        activeSegment = document.querySelector('input[id$="_hidDefaultSegment"]').value;
		
			segmentInfo.searchID = searchID;
            segmentInfo.activeSegment = activeSegment.split('|')[0];
            segmentInfo.activeLinkParam = activeSegment.split('|')[1];
			segmentInfo.sourceID = "";
			
			if(document.getElementById(searchID + 'hidSrcContainer'))
				segmentInfo.sourceID = document.getElementById(searchID + 'hidSrcContainer').value;
            
			if(!segmentInfo.sourceID.length && document.getElementById('hidSrcContainer')) //backward compatibility
				segmentInfo.sourceID = document.getElementById('hidSrcContainer').value;
			else if(!segmentInfo.sourceID.length) 
				segmentInfo.sourceID = document.querySelector('input[id$="_hidSrcContainer"]').value;

			segmentInfo.targetID = ""
			if(document.getElementById(searchID + 'hidTargetContainer'))
				segmentInfo.targetID = document.getElementById(searchID + 'hidTargetContainer').value;
			if(!segmentInfo.targetID.length && document.getElementById('hidTargetContainer'))
				segmentInfo.targetID = document.getElementById('hidTargetContainer').value;
			else if(!segmentInfo.targetID.length) //backward compatibility
				segmentInfo.targetID = document.querySelector('input[id$="_hidTargetContainer"]').value;
				
		},
        GetEmptySearchLinkParam: function (searchID) {
            searchID = searchID || "";
            let emptySearchLinkParam = document.getElementById(searchID + 'hidEmptySearchLinkParam');
			if(!emptySearchLinkParam)
				emptySearchLinkParam = document.querySelector('input[id$="_hidEmptySearchLinkParam"]');
            if (emptySearchLinkParam)
                return emptySearchLinkParam.value;
            else
                return null;
        },
        SetActiveSegment: function (segmentName, url, searchID) {
            searchID = searchID || "";
            var segments = document.querySelectorAll('ul.searchSegments li,div.searchSegments span,div.searchSegments button');
            for (var i = 0; i < segments.length; i++) {
                segments[i].classList.remove('active');
				segments[i].setAttribute('aria-selected', 'false');
				segments[i].setAttribute('tabindex', '-1');
            }
            document.querySelectorAll("ul.searchSegments li[data-name='" + segmentName + "'], div.searchSegments span[data-name='" + segmentName + "'], div.searchSegments button[data-name='" + segmentName + "']").forEach(segmentItem => {
                segmentItem.classList.add("active");
				segmentItem.setAttribute('aria-selected', 'true');
				segmentItem.setAttribute('tabindex', '0');
            });
			
			if(searchID.length && document.getElementById(searchID + "hidActiveSegment"))
                document.getElementById(searchID + "hidActiveSegment").value = segmentName + '|' + url;
            else { //backward compatibility
				document.querySelectorAll('input[id$="hidActiveSegment"').forEach(input => input.value = segmentName + '|' + url);				
			} 					
        },

        GetFirstSegment: function (searchID) {
            searchID = searchID || "";
            if (searchID.length)
                searchID = "." + searchID;

            var firstSegment = document.querySelectorAll('ul.searchSegments' + searchID + ' li[data-name],div.searchSegments span[data-name]');
            if (!firstSegment.length)
                return null;
            return {
                name: firstSegment[0].getAttribute("data-name"),
                url: firstSegment[0].getAttribute("data-url")
            }
        },

        SetPaginationOverridesForBlock: function (pagingElement, searchID) {
            var currentPage = parseInt(pagingElement.value)
                , prevPage = currentPage - 1
                , nextPage = currentPage + 1;
            _.GetCurrentSegmentInfo(searchID);
            var parent, prevButtons, nextButtons;
            var blockID = pagingElement.id.split('_')[0];
            var linkParam = segmentInfo.activeLinkParam + '?';
            var smartSearchResultElement = document.querySelector('input[id*=\'Search_SmartSearchCount\']');
            if (smartSearchResultElement)
                linkParam += smartSearchResultElement.id + '=' + smartSearchResultElement.value + '&';

            linkParam += pagingElement.id + '=';
            if (blockID.toLowerCase() === 'search') {
                parent = pagingElement.parentNode
            } else {
                parent = document.querySelector('#' + blockID + '_ResultsDiv')
            }
            if (parent) {
                prevButtons = parent.querySelectorAll('li.prevButton a');
                nextButtons = parent.querySelectorAll('li.nextButton a');
                pageButtons = parent.querySelectorAll('.pageMenu ul li');
                for (var j = 0; j < prevButtons.length; j++)
                    prevButtons[j].setAttribute('onclick', 'event.preventDefault();NWS.Blocks.SearchBar.Support.LoadSegment("' + segmentInfo.activeSegment + '", "' + linkParam + prevPage + '", "' + segmentInfo.sourceID + '", "' + segmentInfo.targetID + '", null, null, "' + searchID + '");');
                for (var k = 0; k < nextButtons.length; k++)
                    nextButtons[k].setAttribute('onclick', 'event.preventDefault();NWS.Blocks.SearchBar.Support.LoadSegment("' + segmentInfo.activeSegment + '", "' + linkParam + nextPage + '", "' + segmentInfo.sourceID + '", "' + segmentInfo.targetID + '", null, null,"' + searchID + '");');
                for (var l = 0; l < pageButtons.length; l++) {
                    let anchor = pageButtons[l].querySelector('a');
                    if (anchor)
                        anchor.setAttribute('onclick', 'event.preventDefault();NWS.Blocks.SearchBar.Support.LoadSegment(\'' + segmentInfo.activeSegment + '\', \'' + linkParam + (parseInt(anchor.innerText)) + '\', \'' + segmentInfo.sourceID + '\', \'' + segmentInfo.targetID + '\', null, null, \'' + searchID + '\');')
                }
            }
        },

        IsJSON: function (value) {
            try {
				      if(JSON.parse(value)) {
				        const jsonRegex = /^\s*(\{.*\}|\[.*\])\s*$/;
					      return jsonRegex.test(value);
				      }
            } catch (e) {
                return false
            }
            return true;
        },

        SafeUrl: function (path) {
            return window.location.protocol + '//' + window.location.host + path
        },

        SearchRequiresJSON: function () {
            return (document.querySelector('input[id^="Search_RequiresJSON"]') || {
                value: 0
            }).value === "1"
        },

        IsEnterKey: function (evt) {
            return evt.keyCode === 13 || evt.which === 13;
        },

        IsUpArrow: function (evt) {
            return evt.keyCode === 38 || evt.which === 38;
        },

        IsDownArrow: function (evt) {
            return evt.keycode === 40 || evt.which === 40;
        },

        ChangeFocus: function (searchBarElement, currentFocus, indexToMove) {
            var focusArr = new Array();

            focusArr.push(searchBarElement);
            var focusItems = document.querySelectorAll('.suggestionWrapper .suggestedTerm');
            for (var i = 0; i < focusItems.length; i++)
                focusArr.push(focusItems[i]);

            var currentInd = focusArr.indexOf(currentFocus);
            var newFocus = focusArr[Math.abs((focusArr.length + currentInd + indexToMove) % focusArr.length)];
            newFocus.focus();
        },

        OnGetSuggestionsCompleted: function (ajaxResult, resultsPage, searchID, searchBarElement, postbackEnabled) {
            var response = ajaxResult.response,
                parentEl = searchBarElement.parentNode.parentNode,
                suggestionWrapper = parentEl.querySelector(".suggestionWrapper");
            if (!suggestionWrapper) {
                suggestionWrapper = document.createElement("div");
                suggestionWrapper.setAttribute("class", "suggestionWrapper");
                parentEl.appendChild(suggestionWrapper);
            }
            suggestionWrapper.innerHTML = "";

            if (response.Suggestions) {
                var results = response.Suggestions.split(",");
                for (var j = 0; j < results.length; j++) {
                    if (results[j] !== "" && results[j] !== undefined) {
                        var suggestionNode = document.createElement("div");
                        suggestionNode.textContent = results[j];
                        suggestionNode.setAttribute("class", "suggestedTerm");
                        suggestionNode.setAttribute("tabindex", -1);
                        suggestionNode.addEventListener("keydown", function (e) {
                            if (_.IsDownArrow(e) || _.IsUpArrow(e))
                                e.preventDefault();
                        }, false);
                        suggestionNode.addEventListener("keyup", function (e) {
                            NWS.Blocks.SearchBar.Support.SetSearchTerm(e, resultsPage, searchBarElement, postbackEnabled);
                        }, false);
                        suggestionNode.addEventListener("focus", function (e) {
                            document.getElementById(searchID + "searchTerms").value = e.target.innerText;
                            terms = e.target.innerText;

                            if (!postbackEnabled) {
                                clearTimeout(searchTimer);
                                searchTimer = setTimeout(
                                    function () {
                                        _.GetCurrentSegmentInfo(searchID);
                                        NWS.Blocks.SearchBar.Support.LoadSegment(segmentInfo.activeSegment, segmentInfo.activeLinkParam, segmentInfo.sourceID, segmentInfo.targetID, searchID);
                                    }, suggestionInterval);
                            }

                        }, false);
                        suggestionNode.addEventListener("click", function (e) {
                            NWS.Blocks.SearchBar.Support.CloseSuggestions(searchID);
                            document.getElementById(searchID + "searchTerms").value = e.target.innerText;
                            if (postbackEnabled)
                                NWS.Util.UI.SearchSubmit(resultsPage, document.getElementById(searchID + "searchTerms"));
                            else {
                                terms = e.target.innerText;
                                _.GetCurrentSegmentInfo(searchID);

                                NWS.Blocks.SearchBar.Support.LoadSegment(segmentInfo.activeSegment, segmentInfo.activeLinkParam, segmentInfo.sourceID, segmentInfo.targetID, searchID);
                            }

                        }, false);

                        suggestionWrapper.appendChild(suggestionNode);
                    }
                }
            }

            // Remove suggestions when user clicks outside search bar
            document.onclick = function (e) {
                var suggestionContainer = document.querySelector(".suggestionWrapper");
                if (!suggestionContainer) return;

                var searchBarClicked = searchBarElement.contains(e.target);
                suggestionContainer.style.display = searchBarClicked ? "block" : "none";
            };
        },

        OnListBlockAjaxComplete: function (blockID) {
            var isSearchResultsPage = document.querySelector("#resultsContainer");
            var parent = document.querySelector("#F" + blockID + "_ResultsDiv");
            var prevButtons, nextButtons;

            if (isSearchResultsPage && parent) {
                prevButtons = parent.querySelectorAll("li.prevButton a");
                nextButtons = parent.querySelectorAll("li.nextButton a");

                for (var j = 0; j < prevButtons.length; j++) {
                    var defaultPrevAction = prevButtons[j].getAttribute("onclick");
                    prevButtons[j].setAttribute("onclick", "event.preventDefault();" + defaultPrevAction);
                }

                for (var k = 0; k < nextButtons.length; k++) {
                    var defaultNextAction = nextButtons[k].getAttribute("onclick");
                    nextButtons[k].setAttribute("onclick", "event.preventDefault();" + defaultNextAction);
                }
            }

            
            var tagValues = NWS.Block.Aggregation.ExtractTagQueryString(blockID, true);
            if(tagValues !== "" && tagValues !== "!")
                tagValues = "&FB_Values=" + tagValues;
			      else
				      tagValues = "";
			      
            var query = "", concat = "";
			      document.location.search.split("&").forEach(nameValue => {
				      if(!tagValues.length || nameValue.indexOf("FB_Values") == -1)
					    query += concat + nameValue;
				      concat = "&";
			      });
			
			
            var page = document.location.protocol + "//" + document.location.host + document.location.pathname;
            var stateData = { UserSearch: "UserSearchQuery" };
            history.replaceState(stateData, document.title, page + query + tagValues);
        },
        CorrectKeyword: function (jObj) {
            terms = jObj;
            var keyword = (typeof jObj === "undefined") ? "" : jObj["q"];
            keyword = (!keyword) ? "" : keyword;
            searchTermRefs = document.querySelectorAll('input[id^="Search_Keywords"],input[id*="_searchTerms"]');
            for (var i = 0; i < searchTermRefs.length; i++) {
                searchTermRefs[i].value = decodeURIComponent(keyword)
            }
            var searchedFor = ""
                , concat = "";
            for (var key in jObj) {
                switch (key) {
                    case "VisitorUID":
                        break;
                    default:
                        if (jObj[key]) {
                            var value = jObj[key];
                            if (/^@.*==/gi.test(value))
                                value = value.match(/^@.*==["]?([^"]*)/)[1];
                            searchedFor += concat + '"' + value + '"';
                            concat = " and "
                        }
                        break
                }
            }
            var searchTermRefs = document.querySelectorAll('.docMatch .searchString');
            var lastVisible = null;
            for (var i = 0; i < searchTermRefs.length; i++) {
                if (searchTermRefs[i].offsetWidth > 0 && searchTermRefs[i].offsetHeight > 0)
                    lastVisible = searchTermRefs[i];
                searchTermRefs[i].innerHTML = "<span class=\"searchedFor\">" + decodeURIComponent(searchedFor) + "</span>"
            }
            if (lastVisible)
                lastVisible.innerHTML += "<span class=\"clearTerms\"><a href=\"#\" onclick=\"javascript:NWS.Blocks.SearchBar.Support.ExecuteSearch(null, null, {q:null});return false;\">new search</a></span>"
        },

        SetBaseOverrides: function (blockID) {
            if (NWS.Block.DataList)
                NWS.Block.DataList.OnAjaxComplete("DataListing", _.OnListBlockAjaxComplete, [blockID]);

            if (NWS.Block.Aggregation)
                NWS.Block.Aggregation.OnAjaxComplete("AggregationResults", _.OnListBlockAjaxComplete, [blockID]);
        }, 
		GetInsertAfterContainer: function(searchID){		
			let searchTerms = document.querySelector("#" + searchID + "searchTerms[onkeyup*='ResultsFilter']")
			if(!searchTerms) {
				searchTerms = document.querySelector("input[id$=_searchTerms][onkeyup*='ResultsFilter']");				
			}
			if(!searchTerms)
				return null;
			return searchTerms.closest("div.SearchBar.TitanBlock");
		},
		AddKeyboardNavigation: function(tabSelector) {
			document.addEventListener('keydown', function(event) {
				// Only handle keyboard events when focus is on a tab
				if (!event.target.matches(tabSelector + '[role="tab"]')) return;
				
				const tabs = Array.from(document.querySelectorAll(tabSelector + '[role="tab"]'));
				const currentIndex = tabs.indexOf(event.target);
				let newIndex;
				switch(event.key) {
					case 'ArrowRight':
					case 'ArrowDown':
						event.preventDefault();
						newIndex = (currentIndex + 1) % tabs.length;
						const nextTab = tabs[newIndex];
						nextTab.focus();
						break;
						
					case 'ArrowLeft':
					case 'ArrowUp':
						event.preventDefault();
						newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
						const prevTab = tabs[newIndex];
						prevTab.focus();
						break;
						
					case 'Home':
						event.preventDefault();
						const firstTab = tabs[0];
						firstTab.focus();
						break;
						
					case 'End':
						event.preventDefault();
						const lastTab = tabs[tabs.length - 1];
						lastTab.focus();
						break;
					
				}
			});
		}
    };

    return {
        SetInitVars: function (segmentsEnabled) {
            segmentsOn = parseInt(segmentsEnabled) === 1
        },
        Init: function (blockID, enableSegments) {
            NWS.CommonScripts.ModuleManager.OnWindowLoad(function() {
				if (enableSegments)
					NWS.Blocks.SearchBar.Support.SetInitVars(enableSegments);

				if (!segmentsOn)
					return;

				let searchID = "Block" + blockID + "_";
				_.SetBaseOverrides(blockID);
				_.GetCurrentSegmentInfo(searchID);
				_.AddKeyboardNavigation('.searchSegments .segment');
				terms = document.querySelector("input[type=\"text\"][id*=\"Block" + blockID + "_searchTerms\"]").value;
				NWS.Blocks.SearchBar.Support.LoadSegment(segmentInfo.activeSegment, segmentInfo.activeLinkParam, segmentInfo.sourceID, segmentInfo.targetID, null, null, searchID);
				// Turn off segments if other search bar blocks are trying to initialize
				segmentsOn = false;
			});
        },

        LoadSegment: function (name, url, sourceContainerID, targetContainerID, keywords, forceEmptySearch, searchID) {
            searchID = searchID || "";
            NWS.Blocks.SearchBar.Support.CloseSuggestions(searchID);
            var fullUrl;
            if (/[?&]{1}search_keywords=([^&]*)/gi.test(url)) {
                keywords = decodeURIComponent(/[?&]{1}search_keywords=([^&]*)/gi.exec(url)[1]);
            }

            if (keywords) {
                if (typeof keywords === "object" && 'value' in keywords)
                    terms = keywords.value;
                else if (_.IsJSON(keywords))
                    terms = JSON.parse(keywords)
                else
                    terms = keywords;
            } else if (!terms) {
                terms = { q: "" };
            }


            if (_.IsJSON(terms)) {
                terms = JSON.parse(terms);
            } else if (typeof terms !== "object") {
                terms = { q: terms };
            }

            termsForQS = encodeURIComponent(_.SearchRequiresJSON() ? JSON.stringify(terms) : terms["q"]);

            var qs = url.indexOf("?") === -1 ? "?" : "&";
            if (url.toLowerCase().indexOf("search_keywords=") === -1)
                fullUrl = url + qs + "search_keywords=" + termsForQS;
            else
                fullUrl = url;

            if (!(terms["q"] && terms["q"].length) && !(terms["aq"] && terms["aq"].length) && (typeof forceEmptySearch === "undefined" || !forceEmptySearch)) {
                let emptySearchUrl = _.GetEmptySearchLinkParam(searchID);
                if (emptySearchUrl && emptySearchUrl.length > 0)
                    fullUrl = emptySearchUrl;
                else //empty search with no empty search URL and no flag to force empty search, so return and skip running search
                    return;
            } else {
                if (typeof terms !== "object") {
                    terms = (_.IsJSON(terms)) ? JSON.parse(terms) : {
                        q: terms
                    }
                }
                var searchProvider = document.querySelector("input[name='Search_SearchType']");
                if (searchProvider && searchProvider.value.length > 0) {
                    let searchProviderValue = searchProvider.value.replace(' ', '_');
                    var cookieName = document.querySelector("input[name='" + searchProviderValue + "_CookieName']");
                    if (cookieName && cookieName.value.length > 0) {
                        terms["VisitorUID"] = Cookies.get(cookieName.value)
                    }
                    if (navigator && navigator.userAgent)
                        terms["UserAgent"] = navigator.userAgent
                }
                var qs = url.indexOf('?') === -1 ? '?' : '&';
                if (!_.SearchRequiresJSON()) {
                    termsForQS = terms.q
                } else {
                    termsForQS = encodeURIComponent(JSON.stringify(terms))
                }
                if (terms.hasOwnProperty("VisitorUID"))
                    delete terms.VisitorUID;
                if (terms.hasOwnProperty("UserAgent"))
                    delete terms.UserAgent;
                if (/[?&]{1}search_keywords=([^&]*)/gi.test(url))
                    fullUrl = url.replace(/([?&]{1}search_keywords=)([^&]*)/gi, "$1" + termsForQS);
                else
                    fullUrl = url + qs + 'search_keywords=' + termsForQS
            }
			let path=url;
			if(path.indexOf('?') !== -1)
				path = path.split('?')[0];
			
            _.SetActiveSegment(name, path, searchID);
			
            NWS.AjaxSupport.LoadContentWithLoadOptions(fullUrl, { searchID: searchID, insertAfterContainer: _.GetInsertAfterContainer(searchID) }, targetContainerID, sourceContainerID, NWS.Blocks.SearchBar.Support.LoadSegmentBeforeSend, NWS.Blocks.SearchBar.Support.LoadSegmentSuccess, NWS.Blocks.SearchBar.Support.LoadSegmentComplete, null, url);
        },

        LoadSegmentBeforeSend: function (jqXHR, data) {
            let target = NWS.AjaxSupport.EnsureTarget(this.state.targetContainer, this.state.loadOptions.insertAfterContainer);
            target.innerHTML = '<div class=\"loadingWrapper\"><div style=\"display: block;\" class=\"loading\">Loading...</div></div>';
        },

        LoadSegmentSuccess: function (data, status, jqXHR) {
            var sourceSelectors = this.state.sourceContainer.split(',');
            var searchID = this.state.loadOptions.searchID;
            // check if this redirects the user to a direct link for a managed search result
            _.GetCurrentSegmentInfo(searchID);
            var element = document.createElement("div");
            element.innerHTML = data;			
            var formEl = element.querySelector("form");
            var action = formEl.action.split("?")[0];
            var requestedURL = window.location.protocol + "//" + window.location.host + segmentInfo.activeLinkParam.split("?")[0];
            var emptyLinkParameter = _.GetEmptySearchLinkParam(searchID);
			var emptySearchURL = "";
			if(emptyLinkParameter && emptyLinkParameter.length)
				emptySearchURL = window.location.protocol + "//" + window.location.host + emptyLinkParameter;
            
			//if the action value from the source content is not the originally requested URL, discard results and leave existing
			if (action !== requestedURL && action != emptySearchURL) {
                return true;
            }			
            let target = NWS.AjaxSupport.EnsureTarget(this.state.targetContainer, this.state.loadOptions.insertAfterContainer);
            target.innerHTML = "";
            if (!target.classList.contains("SearchBarResults")) {
                target.classList.add("SearchBarResults");
            }
			target.setAttribute('aria-live', 'polite');
            for (var j = 0; j < sourceSelectors.length; j++) {
                let sourceSelector = sourceSelectors[j];
                let source = element.querySelector(sourceSelector);
                if (!source && sourceSelector.indexOf("#") != 0 && sourceSelector.indexOf(".") !== 0)
                    source = element.querySelector("#" + sourceSelector);

                if (source) {
                    target.innerHTML += source.innerHTML;
                } else {
                    console.warn("Missing Source container: " + sourceSelectors[j]);
                }
            }
            if (document.querySelectorAll("div[id*='_ResultsDiv']").length)
                document.querySelectorAll("div[id*='_ResultsDiv']").forEach(div => { div.style.display = ""; });
            
			// evaluate the onsuccess script
            var callback = document.getElementById(searchID + "hidSuccessScript");
			if(callback && !callback.value.length) //backward compatibility
				callback  = document.getElementById("hidSuccessScript");
            if (callback && callback.value !== "")
                setTimeout(function () { eval(callback.value); }, 250);
        },

        LoadSegmentComplete: function (jqXHR, status) {
            var pagingInfo = document.querySelectorAll('input[id*=\'_PageNum\']');
            var searchID = this.state.loadOptions.searchID;
            // Set the pagination overrides if paging exists in the segment
            var currentPage = 1;
            for (var i = 0; i < pagingInfo.length; i++) {
                _.SetPaginationOverridesForBlock(pagingInfo[i], searchID);
                currentPage = pagingInfo[i].value
            }

            // Modify browser history to make "return to listing" from detail page less disjointed
            _.GetCurrentSegmentInfo(searchID);
            var query = "?tab=" + segmentInfo.activeSegment;
            if (termsForQS) {
                query += "&Search_Keywords=" + termsForQS;
            }
            _.CorrectKeyword(terms, searchID);
            if (pagingInfo.length)
                query += '&' + pagingInfo[0].getAttribute("id") + '=' + currentPage;
            var page = _.SafeUrl(document.location.pathname);
            var stateData = { UserSearch: "UserSearchQuery" };
            history.replaceState(stateData, document.title, page + query);
            NWS.Blocks.SearchBar.Support.ApplyHighlights();
            NWS.Blocks.SearchBar.Support.UpdateExternalLinkTargets();
			if(NWS.Display && NWS.Display.LazyImages)
				NWS.Display.LazyImages.init();
			
			if(NWS.Modules && NWS.Modules.Accessibility && NWS.Modules.Accessibility.BaseOverrides && NWS.Modules.Accessibility.BaseOverrides.OnLoadSuccess)
			{
				NWS.Modules.Accessibility.BaseOverrides.OnLoadSuccess();
			}
        },

        ResultsFilter: function (e, minCharacters, delayMS) {
            if (_.IsEnterKey(e))
                return false;

            let searchID = e.target.getAttribute("data-searchid");

            clearTimeout(searchTimer);
            searchTimer = setTimeout(
                function () {
                    let keywords = e.target.value;
                    if (typeof terms === "object")
                        terms["q"] = keywords;
                    else
                        terms = { q: keywords };

                    _.GetCurrentSegmentInfo(searchID);
                    NWS.Blocks.SearchBar.Support.LoadSegment(segmentInfo.activeSegment, segmentInfo.activeLinkParam, segmentInfo.sourceID, segmentInfo.targetID, terms, false, searchID);
                },
                delayMS);
        },

        ExecuteSearch: function (segmentName, url, keywords, searchID) {
            searchID = searchID || "";
            if (typeof terms !== "object")
                terms = {};
            if (_.IsJSON(keywords))
                keywords = JSON.parse(keywords);
            if (typeof keywords === "object") {
                terms["q"] = keywords["q"];
                terms["aq"] = keywords["aq"]
            } else {
                terms["q"] = keywords
            }
            if (segmentName && url) {
                _.SetActiveSegment(segmentName, url, searchID);
                _.GetCurrentSegmentInfo(searchID)
            } else {
                _.GetFirstSegment(searchID)
            }
            NWS.Blocks.SearchBar.Support.LoadSegment(segmentInfo.activeSegment, segmentInfo.activeLinkParam, segmentInfo.sourceID, segmentInfo.targetID, terms, searchID)
        },

        GetSuggestions: function (e, indexID, minCharacters, delayMS, resultsPagePath, searchID, maxSuggestions, postbackEnabled) {
            if (_.IsEnterKey(e))
                return false;

            if (_.IsDownArrow(e)) {
                _.ChangeFocus(e.target, e.target, 1);
                return false;
            }

            if (_.IsUpArrow(e)) {
                _.ChangeFocus(e.target, e.target, -1);
                return false;
            }

            clearTimeout(suggestionTimer);
            suggestionTimer = setTimeout
                (function () {
                    var keywords = e.target.value;
                    if (keywords.length >= minCharacters) {
                        var args = {
                            keyword: keywords,
                            indexID: indexID,
                            maxSuggestions: maxSuggestions,
                            options: e.target.getAttribute("search-provider-options")
                        },
                            callback = new NWS.Ajax.Callback(function (ajaxResult) { _.OnGetSuggestionsCompleted(ajaxResult, resultsPagePath, searchID, e.target, postbackEnabled); });

                        NWS.Ajax.Post("/SearchBarAjax/GetSuggestions", args, "json", callback);
                    }
                },
                    suggestionInterval);
        },

        SetSearchTerm: function (e, resultsPage, searchBar, postbackEnabled) {
            if (_.IsDownArrow(e))
                _.ChangeFocus(searchBar, e.target, 1);

            if (_.IsUpArrow(e))
                _.ChangeFocus(searchBar, e.target, -1);

            if (_.IsEnterKey(e)) {
                NWS.Blocks.SearchBar.Support.CloseSuggestions();
                if (postbackEnabled)
                    NWS.Util.UI.SearchSubmit(resultsPage, searchBar.id);
                else
                    e.preventDefault();
            }
        },

        CloseSuggestions: function () {
            var suggestionContainer = document.querySelector(".suggestionWrapper");
            if (!suggestionContainer) return;
            suggestionContainer.style.display = "none";
        },

        AddHighlightInfo: function (highlightType, position, highlightMarkers) {
            highlights[highlights.length] = {
                type: highlightType,
                position: position,
                highlightMarkers: highlightMarkers
            }
        },

        ApplyHighlights: function () {
            for (let i = 0; i < highlights.length; i++) {
                highlight = highlights[i];
                let contentToHighlight;
                switch (highlight.type) {
                    case "TitleHighlights":
                        contentToHighlight = document.querySelector("div.organicSearchResults div:nth-child(" + highlight.position + ") div.otherStuff h4 a");
                        break;
                    case "ExcerptHighlights":
                        contentToHighlight = document.querySelector("div.organicSearchResults div:nth-child(" + highlight.position + ") div.otherStuff p");
                        break
                }
                if (!contentToHighlight)
                    return;
                let content = contentToHighlight.innerText;
                contentToHighlight.innerHTML = "";
                let adjustedStartPos = 0;
                for (let j = 0; j < highlight.highlightMarkers.lenght; j++) {
                    posToHighlight = highlight.highlightMarkers[j];
                    contentToHighlight.innerHTML += content.substring(adjustedStartPos, posToHighlight.offset) + "<span class=\"matchHighlighting\">" + content.substring(posToHighlight.offset, posToHighlight.offset + posToHighlight.length) + "</span>";
                    adjustedStartPos = posToHighlight.offset + posToHighlight.length
                }
                contentToHighlight.innerHTML += content.substring(adjustedStartPos)
            }
        },

        UpdateExternalLinkTargets: function () {
            let uriPrefix = location.protocol + "//" + location.host;
            let absoluteAnchors = document.querySelectorAll("div.organicSearchResults a:not([href^='" + uriPrefix + "']):not([href^='/'])");
            for (let i = 0; i < absoluteAnchors.length; i++)
                absoluteAnchors[i].setAttribute("target", "_blank")
        }
    };
});