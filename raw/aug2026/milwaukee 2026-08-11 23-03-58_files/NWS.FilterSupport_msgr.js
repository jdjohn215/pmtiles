NWS.initNamespace("NWS.FilterSupport", function () {
    var _ = {
        MakeFullPrefix: function (blockID, classID) {
            return ["F", String(blockID), "_C", String(classID), "_"].join("");
        },

        HandleAriaExpanded: function (fieldset) {
            if (!fieldset)
                return;

            let isCollapsed = fieldset.classList.contains("min"),
                titleSpan = NWS.Util.QueryGet(".head > span[role='button'][aria-expanded]", fieldset);

            if (titleSpan)
                titleSpan.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        },


    };

    return {
        RequeryTimer: {
            Timers: [],
            TimerIDs: [],
            LastValue: {
                Set: function (id, value) {
                    var idx = NWS.FilterSupport.RequeryTimer.TimerIDs.indexOf(id);
                    if (idx === -1)
                        return;

                    NWS.FilterSupport.RequeryTimer.Timers[idx].lastValue = value;
                },
                Get: function (id) {
                    var idx = NWS.FilterSupport.RequeryTimer.TimerIDs.indexOf(id);
                    return idx === -1 ? "" : NWS.FilterSupport.RequeryTimer.Timers[idx].lastValue;
                }
            },

            Clear: function (ctl) {
                var idx = NWS.FilterSupport.RequeryTimer.TimerIDs.indexOf(ctl.id);
                if (idx === -1)
                    return;

                window.clearTimeout(NWS.FilterSupport.RequeryTimer.Timers[idx].timer);
            },

            KeyUp: function (ctl, methodToCall, methodArgs, delayMs) {
                var idx = NWS.FilterSupport.RequeryTimer.TimerIDs.indexOf(ctl.id);
                if (idx === -1) {
                    idx = NWS.FilterSupport.RequeryTimer.Timers.length;
                    NWS.FilterSupport.RequeryTimer.Timers.push({ id: ctl.id, lastValue: ctl.defaultValue, timer: null });
                    NWS.FilterSupport.RequeryTimer.TimerIDs.push(ctl.id);
                }
                else {
                    NWS.FilterSupport.RequeryTimer.Clear(ctl);
                }

                NWS.FilterSupport.RequeryTimer.Timers[idx].timer = window.setTimeout(function () {
                    var newValue = ctl.value;
                    if (newValue !== NWS.FilterSupport.RequeryTimer.LastValue.Get(ctl.id)) {
                        NWS.FilterSupport.RequeryTimer.LastValue.Set(ctl.id, newValue);
                        ctl.value = newValue;

                        methodToCall.apply(methodToCall, methodArgs);
                    }
                }, !delayMs || isNaN(delayMs) ? 500 : delayMs);
            }
        },

        CalendarFilter: {
            _months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],

            DoCallback: function (blockID) {
                var callback = NWS.Util.Get("F" + blockID + "_ChangeFunction"),
                    docID = NWS.Util.Get("F" + blockID + "_DocID");

                NWS.Modules.ExecuteFunctionByName(callback.value, window, [blockID, docID.value]);
            },

            FromToChanged: function (blockID) {
                var from = NWS.Util.Get("F" + blockID + "_calendarFrom"),
                    to = NWS.Util.Get("F" + blockID + "_calendarTo");

                if ((!from.value || NWS.FormSupport.ValueIsDate(from.value)) && (!to.value || NWS.FormSupport.ValueIsDate(to.value)))
                    NWS.FilterSupport.CalendarFilter.SetStartEnd(blockID, from.value, to.value);
            },

            FromToKeyUp: function (inputCtl, blockID) {
                NWS.FilterSupport.RequeryTimer.KeyUp(inputCtl, NWS.FilterSupport.CalendarFilter.FromToChanged, [blockID]);
            },

            GetDateRows: function (calTable) {
                var allRows = calTable.getElementsByTagName("TR");
                var retArray = new Array(6);
                for (var ii = 0; ii < 6; ++ii)
                    retArray[ii] = allRows[ii + 2].getElementsByTagName("TD");

                return retArray;
            },

            SelectDates: function (calID, arrOfDates) {
                var calTable = NWS.Util.Get(calID);
                if (!calTable || calTable.tagName !== "TABLE")
                    return;

                if (typeof arrOfDates === "string")
                    arrOfDates = new Function('"use strict"; return (' + arrOfDates + ')')();

                var dateIndex = 0,
                    dateRows = NWS.FilterSupport.CalendarFilter.GetDateRows(calTable),
                    dateToFill = new Date(calTable.getAttribute("currentMonth")),
                    currentMonth = dateToFill.getMonth();
                dateToFill.setDate(dateToFill.getDate() - (dateToFill.getDay() === 0 ? 7 : dateToFill.getDay()));

                for (dateIndex = 0; dateIndex < arrOfDates.length; ++dateIndex)
                    if (arrOfDates[dateIndex].getTime() >= dateToFill.getTime())
                        break;

                for (var rows = 0; rows < 6; ++rows)
                    for (var cols = 0; cols < 7; ++cols, dateToFill.setDate(dateToFill.getDate() + 1)) {
                        var cell = dateRows[rows][cols];
                        cell.innerHTML = dateToFill.getDate();
                        if (dateIndex < arrOfDates.length && arrOfDates[dateIndex].getTime() === dateToFill.getTime()) {
                            cell.classList.add("hasEvent");
                            dateIndex++;
                        }
                        else
                            cell.classList.remove("hasEvent");
                    }
            },

            SetStartEnd: function (blockID, start, end) {
                var prefix = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    pageNumCtl = NWS.FilterSupport.FilterBlock.GetPageNumCtl(prefix),
                    fromCtl = NWS.Util.Get(prefix + "calendarFrom"),
                    startCtl = NWS.Util.Get(prefix + "Start"),
                    toCtl = NWS.Util.Get(prefix + "calendarTo"),
                    endCtl = NWS.Util.Get(prefix + "End");

                if (fromCtl && fromCtl.value === startCtl.value && toCtl && toCtl.value === endCtl.value)
                    return;

                startCtl.value = start;
                endCtl.value = end !== "" ? end + " 11:59 PM" : end;

                if (pageNumCtl)
                    pageNumCtl.value = "1";

                NWS.FilterSupport.CalendarFilter.DoCallback(blockID);
            },

            WidgetChangeMonth: function (blockID, monthOffset, bSetEnd) {
                var widget = NWS.Util.Get("widget" + blockID),
                    calDate = new Date(widget.getAttribute("currentMonth"));
                calDate.setMonth(calDate.getMonth() + parseInt(monthOffset, 10));

                var endDate = new Date(calDate);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(endDate.getDate() - 1);

                var start = String(calDate.getMonth() + 1) + "/" + calDate.getDate() + "/" + calDate.getFullYear(),
                    end = bSetEnd ? String(endDate.getMonth() + 1) + "/" + endDate.getDate() + "/" + endDate.getFullYear() : "";

                widget.setAttribute("selectedDate", calDate.toString());
                NWS.FilterSupport.CalendarFilter.WidgetReset(blockID, calDate);
                NWS.FilterSupport.CalendarFilter.SetStartEnd(blockID, start, end);
            },

            WidgetClick: function (blockID, ctl, evt) {
                var targetCell = evt.target;
                if (targetCell.classList.contains("otherMonth") || targetCell.tagName !== "TD" || targetCell.parentNode.tagName !== "TR" || targetCell.parentNode.parentNode.tagName !== "TBODY")
                    return;

                var firstOfMonth = new Date(ctl.getAttribute("currentMonth")),
                    selectedDate = new Date(ctl.getAttribute("currentMonth"));
                selectedDate.setDate(selectedDate.getDate() + Number(targetCell.textContent) - 1);

                ctl.setAttribute("selectedDate", selectedDate.toString());
                NWS.FilterSupport.CalendarFilter.WidgetReset(blockID, firstOfMonth);
                NWS.FilterSupport.CalendarFilter.SetStartEnd(blockID, String(selectedDate.getMonth() + 1) + "/" + selectedDate.getDate() + "/" + selectedDate.getFullYear(), "");
            },

            WidgetDateRows: function (blockID) {
                var table = NWS.Util.Get("widget" + blockID),
                    allRows = table.getElementsByTagName("TR"),
                    retArray = [];

                for (var ii = 0; ii < 6; ++ii)
                    retArray.push(allRows[ii + 2].getElementsByTagName("TD"));

                return retArray;
            },

            WidgetInit: function (blockID) {
                var prefix = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    start = NWS.Util.Get(prefix + "Start"),
                    today = (start && start.value) ? new Date(start.value) : new Date(),
                    firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

                var widget = NWS.Util.Get("widget" + blockID);
                widget.setAttribute("selectedDate", today.toString());

                NWS.FilterSupport.CalendarFilter.WidgetReset(blockID, firstOfMonth);
            },

            WidgetReset: function (blockID, firstOfMonth) {
                var widget = NWS.Util.Get("widget" + blockID),
                    title = NWS.Util.Get("widgetTitle" + blockID),
                    dropdown = NWS.Util.Get("monthDropdown" + blockID),
                    selectedDate = new Date(widget.getAttribute("selectedDate")),
                    dateToFill = new Date(firstOfMonth.toString());

                title.textContent = NWS.FilterSupport.CalendarFilter._months[firstOfMonth.getMonth()] + " " + firstOfMonth.getFullYear();
                dateToFill.setDate(firstOfMonth.getDate() - (firstOfMonth.getDay() === 0 ? 7 : firstOfMonth.getDay()));

                if (widget.tagName === "TABLE") {
                    var dateRows = NWS.FilterSupport.CalendarFilter.WidgetDateRows(blockID);
                    for (var rows = 0; rows < 6; ++rows)
                        for (var cols = 0; cols < 7; ++cols, dateToFill.setDate(dateToFill.getDate() + 1)) {
                            var cell = dateRows[rows][cols];
                            cell.textContent = dateToFill.getDate();
                            cell.className = dateToFill.getMonth() !== firstOfMonth.getMonth() ? "otherMonth" : "";

                            /* Using == here to accommodate the string-to-integer comparison that would fail if using === */
                            if (!cell.classList.contains("otherMonth") && cell.textContent == selectedDate.getDate()) {
                                cell.classList.add("selected");
                                cell.classList.add("selectedDate");
                            }
                        }
                }

                if (dropdown) {
                    dropdown.length = 0;
                    for (var m = -10; m < 15; m++) {
                        var month = new Date(firstOfMonth.toString());
                        month.setMonth(firstOfMonth.getMonth() + m);
                        dropdown.options[dropdown.options.length] = new Option(NWS.FilterSupport.CalendarFilter._months[month.getMonth()] + " " + month.getFullYear(), String(m), false, m === 0);
                    }
                }

                widget.setAttribute("currentMonth", firstOfMonth.toString());
            }
        },

        FilterBlock: {
            MakePrefix: function (blockID) {
                return "F" + String(blockID) + "_";
            },

            MakeFullPrefix: function (blockID, classID) {
                return NWS.FilterSupport.FilterBlock.MakePrefix(blockID) + "C" + String(classID) + "_";
            },

            GetKeywordCtl: function (prefix) {
                return document.getElementById(prefix + "keywordFilter");
            },

            GetPageNumCtl: function (prefix) {
                return document.getElementById(prefix + "PageNum");
            },

            GetSortOrderCtl: function (prefix) {
                return document.getElementById(prefix + "SortOrder");
            },

            GetTagFieldset: function (blockID, classID) {
                return NWS.Util.Get(NWS.FilterSupport.FilterBlock.MakeFullPrefix(blockID, classID) + "fieldset");
            },

            GetInputsDiv: function (blockID, classID) {
                var div = NWS.Util.Get(NWS.FilterSupport.FilterBlock.MakeFullPrefix(blockID, classID) + "div");
                if (div.classList.contains("inputs"))
                    return div;

                return null;
            },

            GetFilterDocumentRoot: function (blockPrefix) {
                var root = document.getElementById("FilterArea_" + blockPrefix);
                if (!root)
                    return document;

                return root;
            },

            ClassificationMinMax: function (blockID, classID) {
                NWS.FilterSupport.FilterBlock.RecalcSeeAllLess(blockID, classID);

                var fieldset = NWS.FilterSupport.FilterBlock.GetTagFieldset(blockID, classID);
                if (!fieldset)
                    return;

                fieldset.classList.toggle("min");
                _.HandleAriaExpanded(fieldset);
            },

            RecalcSeeAllLess: function (blockID, classID) {
                var fieldset = NWS.FilterSupport.FilterBlock.GetTagFieldset(blockID, classID);
                if (!fieldset)
                    return;

                if (!fieldset.getAttribute("limitNum"))
                    return;

                var limit = parseInt(fieldset.getAttribute("limitNum"));
                if (!limit || limit > 1000)
                    return;

                var inputsDiv = NWS.FilterSupport.FilterBlock.GetInputsDiv(blockID, classID);
                if (!inputsDiv)
                    return;

                var hideZeros = fieldset.classList.contains("hideZero"),
                    prefix = NWS.FilterSupport.FilterBlock.MakeFullPrefix(blockID, classID),
                    allInputs = inputsDiv.getElementsByTagName("DIV");
                for (var ii = 0; ii < allInputs.length; ++ii) {
                    if (!allInputs[ii].id || allInputs[ii].id.indexOf(prefix) !== 0)
                        continue;

                    if (allInputs[ii].classList.contains("selected")) {
                        limit--;
                        allInputs[ii].classList.remove("seeMore");
                    }
                }

                var oneHidden = false;
                for (var jj = 0; jj < allInputs.length; ++jj) {
                    if (!allInputs[jj].id || allInputs[jj].id.indexOf(prefix) !== 0)
                        continue;

                    if (allInputs[jj].classList.contains("selected"))
                        continue;

                    if (hideZeros && allInputs[jj].classList.contains("zero"))
                        continue;

                    if (limit-- <= 0) {
                        allInputs[jj].classList.add("seeMore");
                        oneHidden = true;
                    }
                    else
                        allInputs[jj].classList.remove("seeMore");
                }

                var more = NWS.Util.Get(prefix + "more"),
                    less = NWS.Util.Get(prefix + "less");
                if (more)
                    more.style.display = oneHidden ? "" : "none";
                if (less)
                    less.style.display = oneHidden ? "" : "none";
            },

            HandleCommonLinkSelect: function (blockID, classID, container, evt) {
                var fullPrefix = _.MakeFullPrefix(blockID, classID),
                    target = NWS.FilterSupport.FilterBlock.GetInputWrapperDiv(fullPrefix, container, evt);
                if (!target)
                    return;

                NWS.FilterSupport.FilterBlock.ClearInputWrapperSelect(container, fullPrefix);
                var submitID = target.id.substring(0, target.id.lastIndexOf("_"));
                NWS.FilterSupport.FilterBlock.SetInputWrapperSelect(submitID);

                NWS.FormSupport.SFSetRadioValue(fullPrefix.slice(0, -1), submitID);
                NWS.FilterSupport.FilterBlock.CollapseTagSet(blockID, classID, true);
            },

            FormatClassifications: function (blockPrefix) {
                var checkBoxes = [];

                var allInputs = NWS.FilterSupport.FilterBlock.GetFilterDocumentRoot(blockPrefix).getElementsByTagName("INPUT");
                for (var ii = 0; ii < allInputs.length; ++ii) {
                    var myId = allInputs[ii].id;

                    if (allInputs[ii].type === "checkbox" &&   // may be a filter checkbox
                        allInputs[ii].checked &&               // it is checked
                        myId.indexOf(blockPrefix) === 0)       // and it is mine, all mine
                        checkBoxes.push(myId);

                    if (allInputs[ii].type === "radio" &&      // may be a filter checkbox
                        allInputs[ii].checked &&               // it is checked
                        myId.indexOf(blockPrefix) === 0)       // and it is mine, all mine
                        checkBoxes.push(myId);
                }

                var allSelects = NWS.FilterSupport.FilterBlock.GetFilterDocumentRoot(blockPrefix).getElementsByTagName("SELECT");
                for (var jj = 0; jj < allSelects.length; ++jj) {
                    if (!allSelects[jj].value || allSelects[jj].getAttribute("no-tag") === "1")
                        continue;

                    // Tag values should be safe, but encode them as a precaution 
                    if (allSelects[jj].id.indexOf(blockPrefix) === 0)
                        checkBoxes.push(encodeURIComponent(allSelects[jj].value));
                }

                return checkBoxes.join("!");
            },

            HaveClassificationsChanged: function (blockPrefix, blockID) {
                var hasChanges = false;

                var allInputs = NWS.FilterSupport.FilterBlock.GetFilterDocumentRoot(blockPrefix).getElementsByTagName("INPUT");
                for (var ii = 0; ii < allInputs.length; ++ii) {
                    var myId = allInputs[ii].id;

                    if (allInputs[ii].type === "checkbox" && myId.indexOf(blockPrefix) === 0) {
                        hasChanges |= allInputs[ii].checked !== allInputs[ii].defaultChecked;
                        NWS.FilterSupport.FilterBlock.ResetSelectClass(allInputs[ii], allInputs[ii].checked, blockID, parseInt(myId.substring(blockPrefix.length + 1)));
                    }

                    if (allInputs[ii].type === "radio" &&
                        myId.indexOf(blockPrefix) === 0) {
                        hasChanges |= allInputs[ii].checked !== allInputs[ii].defaultChecked;
                        NWS.FilterSupport.FilterBlock.ResetSelectClass(allInputs[ii], allInputs[ii].checked, blockID, parseInt(myId.substring(blockPrefix.length + 1)));
                    }
                }
                var allSelects = NWS.FilterSupport.FilterBlock.GetFilterDocumentRoot(blockPrefix).getElementsByTagName("SELECT");
                for (var jj = 0; jj < allSelects.length; ++jj) {
                    if (allSelects[jj].id.indexOf(blockPrefix) === 0 &&
                        NWS.FormSupport.SFGetSelectValue(allSelects[jj].id) !== NWS.FormSupport.SFGetSelectDefaultValue(allSelects[jj].id)) {
                        return true;
                    }
                }

                return hasChanges;
            },

            GetInputWrapperDivFromCtl: function (prefix, target, container) {
                while (target) {
                    var myTarget = target;
                    target = target.parentNode;
                    if (!target)
                        return null;

                    if (myTarget.tagName !== "DIV")
                        continue;

                    if (myTarget === container)
                        return null; // we've gone too far and can't find it

                    if (!myTarget.id || myTarget.id.indexOf(prefix) !== 0)
                        continue;

                    return myTarget;
                }
                return null;   
            },

            GetInputWrapperDiv: function (prefix, container, evt) {
                return NWS.FilterSupport.FilterBlock.GetInputWrapperDivFromCtl(prefix, evt.target, container);
            },

            ClearInputWrapperSelect: function (container, fullPrefix) {
                var allKids = container.getElementsByTagName("DIV");
                for (var ii = 0; ii < allKids.length; ++ii)
                    if (allKids[ii].id && allKids[ii].id.indexOf(fullPrefix) === 0)
                        allKids[ii].classList.remove("selected");  
            },

            SetInputWrapperSelect: function (id) {
                NWS.Util.Get(id + "_div").classList.add("selected");
            },

            RemoveInputWrapperSelect: function (id) {
                NWS.Util.Get(id + "_div").classList.remove("selected");
            },

            SeeAllLess: function (blockID, classID) {
                var fieldset = NWS.FilterSupport.FilterBlock.GetTagFieldset(blockID, classID);
                if (!fieldset)
                    return;

                NWS.FilterSupport.FilterBlock.RecalcSeeAllLess(blockID, classID);
                if (fieldset.classList.contains("seeMore")) {
                    fieldset.classList.remove("seeMore");
                    fieldset.classList.add("seeLess");
                }
                else {
                    fieldset.classList.remove("seeLess");
                    fieldset.classList.add("seeMore");
                }
            },

            CollapseTagSet: function (blockID, classID, turnOn) {
                var fieldset = NWS.FilterSupport.FilterBlock.GetTagFieldset(blockID, classID);
                if (!fieldset)
                    return;

                if (fieldset.getAttribute("runaway") !== "1")
                    return;

                fieldset.classList.toggle("min", turnOn);
                _.HandleAriaExpanded(fieldset);
            },

            ResetSelectClass: function (target, selected, blockID, classID) {
                if (selected)
                    NWS.FilterSupport.FilterBlock.SetInputWrapperSelect(target.id);
                else
                    NWS.FilterSupport.FilterBlock.RemoveInputWrapperSelect(target.id);

                NWS.FilterSupport.FilterBlock.CollapseTagSet(blockID, classID, selected);
            },

            ResetFieldsetState: function (blockID) {
                var fieldsets = document.getElementsByTagName("FIELDSET");
                for (var ii = 0; ii < fieldsets.length; ++ii) {
                    var nonZero = false, hasSelection = false;
                    var allSpans = fieldsets[ii].getElementsByTagName("SPAN");
                    for (var jj = 0; jj < allSpans.length; ++jj) {
                        if (!allSpans[jj].classList.contains("uses"))
                            continue;

                        if (allSpans[jj].getAttribute("uses") !== "0")
                            nonZero = true;
                        else
                            continue;

                        var parent = allSpans[jj].parentNode;
                        while (parent && parent.tagName !== "DIV")
                            parent = parent.parentNode;
                        if (parent.classList.contains("selected"))
                            hasSelection = true;

                        if (nonZero && hasSelection)
                            break;
                    }

                    if (fieldsets[ii].getAttribute("runaway") === "1" && hasSelection) {
                        fieldsets[ii].classList.add("min");
                        _.HandleAriaExpanded(fieldsets[ii]);
                    }

                    if (fieldsets[ii].classList.contains("hideZero") && !nonZero)
                        fieldsets[ii].style.display = "none";
                    else {
                        fieldsets[ii].style.display = null;		// allow to fall back to default styling

                        var blockDataFieldID = blockID;
                        if (fieldsets[ii].getAttribute("dataField"))
                            blockDataFieldID = blockDataFieldID + "_DF" + fieldsets[ii].getAttribute("dataField");

                        NWS.FilterSupport.FilterBlock.RecalcSeeAllLess(blockDataFieldID, fieldsets[ii].getAttribute("classID"));
                    }
                }

            },

            ResetSelections: function (blockID, classID) {
                var div = NWS.FilterSupport.FilterBlock.GetInputsDiv(blockID, classID);
                if (!div)
                    return;

                var boxes = div.getElementsByTagName("INPUT");
                for (var ii = 0; ii < boxes.length; ++ii)
                    if (boxes[ii].checked) {
                        NWS.Util.Get(boxes[ii].id + "_div").classList.remove("selected");
                        boxes[ii].checked = false;
                    }

                NWS.FilterSupport.FilterBlock.RecalcSeeAllLess(blockID, classID);

                var fieldset = NWS.FilterSupport.FilterBlock.GetTagFieldset(blockID, classID);
                fieldset.classList.remove("min");
                fieldset.classList.remove("seeMore");
                fieldset.classList.add("seeLess");

                _.HandleAriaExpanded(fieldset);
            },

            ResubmitCheckForChanges: function (blockID) {
                var prefix = NWS.FilterSupport.FilterBlock.MakePrefix(blockID);
                var retVal = false;

                var pageNum = NWS.FilterSupport.FilterBlock.GetPageNumCtl(prefix);
                if (pageNum && pageNum.value !== pageNum.defaultValue)
                    retVal |= true;

                var sortOrderCtl = NWS.FilterSupport.FilterBlock.GetSortOrderCtl(prefix);
                if (sortOrderCtl && sortOrderCtl.value !== sortOrderCtl.defaultValue)
                    retVal |= true;

                var keywordFilterCtl = NWS.FilterSupport.FilterBlock.GetKeywordCtl(prefix);
                if (keywordFilterCtl && keywordFilterCtl.value !== keywordFilterCtl.defaultValue)
                    retVal |= true;

                retVal |= NWS.FilterSupport.FilterBlock.HaveClassificationsChanged(prefix, blockID);

                return retVal;
            },

            ShowHideWaiting: function (blockID, isWaiting) {
                var prefix = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    waitingDiv = NWS.Util.Get(prefix + "Waiting"),
                    resultsArea = NWS.Util.Get(prefix + "ResultsDiv");

                if (resultsArea) {
                    let blockRoot = NWS.Util.GetClosest(resultsArea, ".TitanBlock");
                    if (blockRoot && !blockRoot.hasAttribute("aria-live"))
                        blockRoot.setAttribute("aria-live", "polite");
                }

                if (waitingDiv)
                    waitingDiv.className = isWaiting ? "loading waiting" : "loading";

                if (resultsArea)
                    resultsArea.style.display = isWaiting ? "none" : "block";
            },

            UpdateFilterCounts: function (blockID, filterArray) {
                var dataArray = filterArray;
                if (!dataArray || dataArray.length === 0)
                    return NWS.FilterSupport.FilterBlock.ResetFieldsetState(blockID);

                for (var ii = 0; ii < dataArray.length; ++ii) {
                    var ctl = NWS.Util.Get(dataArray[ii].i + "_div");
                    if (!ctl)
                        continue;

                    ctl.classList.toggle("zero", dataArray[ii].v === 0);

                    var spans = ctl.getElementsByTagName("SPAN");
                    for (var jj = 0; jj < spans.length; ++jj)
                        if (spans[jj].classList.contains("uses")) {
                            spans[jj].innerHTML = ["(", String(dataArray[ii].v), ")"].join("");
                            spans[jj].setAttribute("uses", dataArray[ii].v);
                            break;
                        }
                }

                NWS.FilterSupport.FilterBlock.ResetFieldsetState(blockID);
            },

            UpdateFilterSuggestions: function (blockID, suggestionUpdates) {
                if (!suggestionUpdates || suggestionUpdates.length === 0)
                    return;

                for (var ii = 0; ii < suggestionUpdates.length; ii++) {
                    var attribs = NWS.Util.Get(suggestionUpdates[ii].id + "_attributes");
                    if (attribs)
                        attribs.value = JSON.stringify(suggestionUpdates[ii]);
                }
            }
        },

        LocationSuggest: {
            BlurTimeout: null,

            Blur: function (blockID, queryText, evt) {
                evt.preventDefault();
                var delay = function () {
                    NWS.FilterSupport.LocationSuggest.Close(blockID, queryText);
                };

                NWS.FilterSupport.LocationSuggest.BlurTimeout = setTimeout(delay, 200);
            },

            Close: function (blockID, queryText) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    suggestions = NWS.Util.Get(baseID + "locationSuggestions");

                NWS.Util.Get(baseID + "location").value = queryText;
                NWS.FilterSupport.RequeryTimer.LastValue.Set(baseID + "location", queryText);
                suggestions.innerHTML = "";
                suggestions.parentNode.style.display = "none";
            },

            Focus: function (blockID) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    query = NWS.Util.Get(baseID + "location");

                if (query.value === "" || query.value === "My Location" || query.value === NWS.FilterSupport.RequeryTimer.LastValue.Get(query.id))
                    return;

                var regexp = NWS.Util.Get(baseID + "validationRegEx").value,
                    errMsg = NWS.Util.Get(baseID + "validationErrorMsg").value,
                    ctl = NWS.Util.Get(target.id).value;

                if (regexp && ctl.value.matches(regexp)=== null) {
                    alert(errMsg);
                    return;
                }

                NWS.FilterSupport.LocationSuggest.Suggest(blockID, query.value);
            },

            GetCurrent: function (baseID, txtBxCtl) {
                if (!NWS.FilterSupport.LocationSuggest.HasResults(baseID))
                    return;

                var ulParent = NWS.Util.Get(baseID + "locationSuggestions").parentNode,
                    selectedLI = NWS.Util.QueryGet("li.hover", ulParent);

                if (!selectedLI)
                    return null;

                return selectedLI;
            },

            HasResults: function (baseID) {
                var ul = NWS.Util.Get(baseID + "locationSuggestions"),
                    noResult = NWS.Util.QueryGet("li.noResults", ul),
                    lis = NWS.Util.QueryGetAll("li", ul),
                    ulParent = ul.parentNode;

                if (noResult)
                    return false;

                if (!lis || lis.length === 0 || ulParent.style.display === "none")
                    return false;

                return lis.length > 0;
            },

            HoverNext: function (baseID) {
                if (!NWS.FilterSupport.LocationSuggest.HasResults(baseID))
                    return;

                var lis = NWS.Util.Get(baseID + "locationSuggestions").querySelectorAll("li"),
                    newHover = 0;
                for (i = 0; i < lis.length; i++) {
                    if (lis[i].className === "hover") {
                        lis[i].className = "";
                        newHover = (i === lis.length - 1) ? 0 : i + 1;
                        break;
                    }
                }
                lis[newHover].className = "hover";
            },

            HoverPrev: function (baseID) {
                if (!NWS.FilterSupport.LocationSuggest.HasResults(baseID))
                    return;

                var lis = NWS.Util.Get(baseID + "locationSuggestions").querySelectorAll("li"),
                    newHover = lis.length - 1;
                for (i = 0; i < lis.length; i++) {
                    if (lis[i].className === "hover") {
                        lis[i].className = "";
                        newHover = (i === 0) ? lis.length - 1 : i - 1;
                        break;
                    }
                }
                lis[newHover].className = "hover";
            },

            KeyUp: function (blockID, funcPrefix, evt) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    target = evt.target,
                    key = evt.which || evt.keyCode;

                evt.preventDefault();

                if (key === 27) /* ESC */
                    NWS.FilterSupport.LocationSuggest.Close(blockID, "");
                else if (target.value === "")
                    NWS.FilterSupport.LocationSuggest.SetAndGo(blockID, "", "", "");
                else if (key === 38) /* UP */
                    NWS.FilterSupport.LocationSuggest.HoverPrev(baseID);
                else if (key === 40) /* DOWN */
                    NWS.FilterSupport.LocationSuggest.HoverNext(baseID);
                else {
                    var selection = NWS.FilterSupport.LocationSuggest.GetCurrent(baseID, target);
                    if (key === 13 && selection) {
                        NWS.FilterSupport.LocationSuggest.SelectSuggestion(blockID, funcPrefix, { target: selection });
                        return;
                    }

                    var val = target.value.trim();
                    if (val === "")
                        return;

                    if (val === "My Location")
                        return;

                    var regexp = NWS.Util.Get(baseID + "validationRegEx").value,
                        errMsg = NWS.Util.Get(baseID + "validationErrorMsg").value,
                        ctl = NWS.Util.Get(target.id);

                    if (regexp && ctl.value.match(target.id, regexp) === null) {
                        alert(errMsg);
                        return;
                    }

                    NWS.FilterSupport.RequeryTimer.KeyUp(target, NWS.FilterSupport.LocationSuggest.Suggest, [blockID, val], 500);
                }
            },

            SelectSuggestion: function (blockID, funcPrefix, evt) {
                if (NWS.FilterSupport.LocationSuggest.BlurTimeout)
                    clearTimeout(NWS.FilterSupport.LocationSuggest.BlurTimeout);

                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID);
                if (!NWS.FilterSupport.LocationSuggest.HasResults(baseID))
                    return;

                var target = evt.target;
                if (target.nodeName === "SPAN")
                    target = target.parentNode;

                if (target.nodeName !== "LI")
                    return;

                NWS.FilterSupport.LocationSuggest.SetAndGo(blockID, target.textContent, target.getAttribute("lat"), target.getAttribute("lng"));
            },

            SetAndGo: function (blockID, search, lat, lng) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID);
                NWS.FilterSupport.LocationSuggest.Close(blockID, search);

                NWS.Util.Get(baseID + "latitude").value = lat;
                NWS.Util.Get(baseID + "longitude").value = lng;
                NWS.FilterSupport.FilterBlock.GetPageNumCtl(baseID).value = "1";

                var docID = NWS.Util.Get(baseID + "DocID").value,
                    funcPrefix = NWS.Util.Get("FilterArea_" + baseID).getAttribute("blockPrefix");

                NWS.Modules.ExecuteFunctionByName(funcPrefix + "Submit", window, [blockID, docID]);
            },

            Suggest: function (blockID, searchFor) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    args = {
                        docID: NWS.Util.Get(baseID + "DocID").value,
                        blockID: blockID,
                        search: searchFor
                    },
                    callback = NWS.Ajax.QueuedCallback("LocationSuggest" + blockID, function (result) { NWS.FilterSupport.LocationSuggest.SuggestCallback(result, blockID); });

                NWS.Ajax.Post("/DataAjax/GetLocations", args, "json", callback);
            },

            SuggestCallback: function (ajaxResult, blockID) {
                var baseID = NWS.FilterSupport.FilterBlock.MakePrefix(blockID),
                    locations = ajaxResult.response.locations;

                if (!locations || locations.length === 0) {
                    NWS.FilterSupport.LocationSuggest.SetAndGo(blockID, NWS.Util.Get(baseID + "location").value, "", "");
                    return;
                }
                else if (locations.length === 1 && locations[0].IsMatch) {
                    NWS.FilterSupport.LocationSuggest.SetAndGo(blockID, NWS.Util.Get(baseID + "location").value, locations[0].Latitude, locations[0].Longitude);
                    return;
                }

                var ul = NWS.Util.Get(baseID + "locationSuggestions"),
                    ulParent = ul.parentNode,
                    suggestLIs = [];
                for (var i = 0; i < locations.length; i++)
                    suggestLIs.push("<li lat='", locations[i].Latitude, "' lng='", locations[i].Longitude, "'>", locations[i].Description, "</li>");

                ul.innerHTML = suggestLIs.join("");
                ulParent.style.display = "block";
            }
        }, 

        TagSuggest: {
            SelectSuggestion: function (blockID, classID, funcPrefix, evt) {
                if (NWS.FilterSupport.TagSuggest.BlurTimeout)
                    clearTimeout(NWS.FilterSupport.TagSuggest.BlurTimeout);

                var baseID = _.MakeFullPrefix(blockID, classID);
                if (!NWS.FilterSupport.TagSuggest.HasResults(baseID))
                    return;

                var target = evt.target;
                if (target.nodeName === "SPAN")
                    target = target.parentNode;

                if (target.nodeName !== "LI")
                    return;

                NWS.FilterSupport.TagSuggest.Close(blockID, classID, "");

                if (funcPrefix === "Upload") {
                    NWS.FilterSupport.TagSuggest.HandleSelectionHtmlForUpload(blockID, classID, target);
                    return;
                }
                else if (funcPrefix === "Reg") {
                    NWS.FilterSupport.TagSuggest.HandleSelectionHtmlForReg(blockID, classID, target);
                    return;
                }

                NWS.FilterSupport.TagSuggest.HandleSelectionHtmlForFilter(blockID, classID, target, funcPrefix);
                NWS.Modules.ExecuteFunctionByName(funcPrefix + "ClassificationCheck", window, [blockID]);
            },

            HandleSelectionHtmlForUpload: function (blockID, classID, target) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    itemID = target.getAttribute("i"),
                    attribName = target.getAttribute("v"),
                    allowMulti = NWS.Util.Get(baseID + "suggestions").getAttribute("allowMulti") === "1",
                    type = allowMulti ? "checkbox" : "radio",
                    idPrefix = (allowMulti) ? "upl_CM_" : "upl_CS_",
                    id = idPrefix + classID + "_" + itemID + "_" + blockID,
                    name = allowMulti ? id : "upl_CS_" + classID + "_" + blockID,
                    div = NWS.Util.Get(baseID + "div"),
                    check = NWS.Util.Get(id);

                if (check && !check.checked)
                    check.checked = true;

                if (check)
                    return;

                var newItem = ["<span><input type=\"", type, "\" id=\"", id, "\" name=\"", name, "\"", type === "radio" ? [" value=\"", itemID, "\""].join("") : "", "></input><label for=\"", id, "\">", attribName, "</label></span>"].join("");

                /* If we're adding to the DOM, grab the state of the checkboxes so we can repopulate them
                   as they were before adding the new checkbox. If you don't they'll reset to the original
                   state from the time they entered the DOM. */

                var state = NWS.FilterSupport.TagSuggest.GetState(div);
                div.insertAdjacentHTML("beforeend", newItem);

                NWS.FilterSupport.TagSuggest.SetState(state);
                check = NWS.Util.Get(id);
                check.checked = true;
            },

            HandleSelectionHtmlForReg: function (blockID, classID, target) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    itemID = target.getAttribute("i"),
                    attribName = target.getAttribute("v"),
                    idPrefix = "reg_C_",
                    id = idPrefix + classID + "_" + itemID + "_" + blockID,
                    div = NWS.Util.Get(baseID + "div"),
                    check = NWS.Util.Get(id);

                if (check && !check.checked)
                    check.checked = true;

                if (check)
                    return;

                var newItem = ["<span><input type=\"checkbox\" id=\"", id, "\" name=\"", id, "\"></input><label for=\"", id, "\">", attribName, "</label></span>"].join("");
                var state = NWS.FilterSupport.TagSuggest.GetState(div);
                div.insertAdjacentHTML("beforeend", newItem);
                NWS.FilterSupport.TagSuggest.SetState(state);
                check = NWS.Util.Get(id);
                check.checked = true;
            },

            HandleSelectionHtmlForFilter: function (blockID, classID, target, funcPrefix) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    attribID = target.getAttribute("classID"),
                    attribName = target.getAttribute("v"),
                    attribUses = target.getAttribute("u"),
                    div = NWS.Util.Get(baseID + "div"),
                    check = NWS.Util.Get(attribID);

                if (check && !check.checked) {
                    NWS.Util.Get(attribID + "_div").classList.add("selected");
                    check.checked = true;
                }

                if (check)
                    return;

                var newItem = ["<div id=\"", attribID, "_div\" class=\"selected\"><span><input type=\"checkbox\" name=\"", attribID, "\" id=\"", attribID, "\" onclick=\"", funcPrefix, "ClassificationDynamicCheck(", blockID, ", ", classID, ", this)\"></input><label for=\"", attribID, "\">", attribName, "<span class=\"uses\" uses=\"", attribUses, "\"> (", attribUses, ")</span></label></span></div>"].join("");
                var state = NWS.FilterSupport.TagSuggest.GetState(div);
                div.insertAdjacentHTML("beforeend", newItem);
                NWS.FilterSupport.TagSuggest.SetState(state);
                check = NWS.Util.Get(attribID);
                check.checked = true;
            },

            GetState: function (div) {
                var allChecks = NWS.Util.QueryGetAll("input[type='checkbox'], input[type='radio']", div),
                    retVal = allChecks.map(c => new Object({ id: c.id, checked: c.checked }));

                return retVal;
            },

            SetState: function (state) {
                for (var c = 0; c < state.length; c++)
                    document.getElementById(state[c].id).checked = state[c].checked;
            },

            KeyUp: function (blockID, classID, funcPrefix, evt) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    target = evt.target,
                    key = evt.keyCode;

                evt.preventDefault();

                if (key === 27 || target.value === "") /* ESC */
                    NWS.FilterSupport.TagSuggest.Close(blockID, classID, "");
                else if (key === 38) /* UP */
                    NWS.FilterSupport.TagSuggest.HoverPrev(baseID);
                else if (key === 40) /* DOWN */
                    NWS.FilterSupport.TagSuggest.HoverNext(baseID);
                else {
                    var selection = NWS.FilterSupport.TagSuggest.GetCurrent(baseID, target);
                    if (key === 13 && selection) {
                        NWS.FilterSupport.TagSuggest.SelectSuggestion(blockID, classID, funcPrefix, { target: selection });
                        return;
                    }

                    if (target.value === "")
                        return;

                    NWS.FilterSupport.RequeryTimer.KeyUp(target, NWS.FilterSupport.TagSuggest.Suggest, [baseID, target.value], 10);
                }
            },

            Reset: function (blockID, classID, funcPrefix, evt) {
                if (NWS.FilterSupport.TagSuggest.BlurTimeout)
                    clearTimeout(NWS.FilterSupport.TagSuggest.BlurTimeout);

                evt.preventDefault();

                var baseID = _.MakeFullPrefix(blockID, classID),
                    div = NWS.Util.Get(baseID + "div");

                NWS.Modules.ExecuteFunctionByName(funcPrefix + "ResetClassificationCheckbox", window, [blockID, classID]);
                div.innerHTML = "<!-- placeholder -->";

                NWS.FilterSupport.TagSuggest.Close(blockID, classID, "");
            },

            Focus: function (blockID, classID) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    query = NWS.Util.Get(baseID + "query");

                if (query.value !== "")
                    NWS.FilterSupport.TagSuggest.Suggest(baseID, query.value);
            },

            BlurTimeout: null,

            Blur: function (blockID, classID, queryText, evt) {
                evt.preventDefault();
                var delay = function () {
                    NWS.FilterSupport.TagSuggest.Close(blockID, classID, queryText);
                };
                NWS.FilterSupport.TagSuggest.BlurTimeout = setTimeout(delay, 200);
            },

            Close: function (blockID, classID, queryText) {
                var baseID = _.MakeFullPrefix(blockID, classID),
                    query = NWS.Util.Get(baseID + "query"),
                    totals = NWS.Util.Get(baseID + "totals"),
                    suggestions = NWS.Util.Get(baseID + "suggestions");

                query.value = queryText;
                NWS.FilterSupport.RequeryTimer.LastValue.Set(query.id, "");
                totals.textContent = "";
                suggestions.innerHTML = "";
                suggestions.parentNode.style.display = "none";
            },

            HasResults: function (baseID) {
                var ul = NWS.Util.Get(baseID + "suggestions"),
                    noResult = NWS.Util.QueryGet("li.noResults", ul),
                    lis = NWS.Util.QueryGetAll("li", ul),
                    ulParent = ul.parentNode;

                if (noResult)
                    return false;

                if (!lis || lis.length === 0 || ulParent.style.display === "none")
                    return false;

                return lis.length > 0;
            },

            Suggest: function (baseID, searchFor) {
                searchFor = searchFor.toLowerCase();

                var fieldset = NWS.Util.Get(baseID + "fieldset"),
                    attributes = JSON.parse(NWS.Util.Get(baseID + "attributes").value).suggestions,
                    totals = NWS.Util.Get(baseID + "totals"),
                    ul = NWS.Util.Get(baseID + "suggestions"),
                    ulParent = ul.parentNode,
                    limitNum = parseInt(fieldset.getAttribute("limitNum"), 10),
                    matches = attributes.filter(attrib => attrib.name.toLowerCase().indexOf(searchFor) === 0).slice(0, limitNum);

                if (matches.length === 0) {
                    ul.innerHTML = "<li class='noResults'>no matches found</li>";
                    ulParent.style.display = "block";
                    return;
                }

                totals.textContent = matches.length + " of " + attributes.length;

                var suggestLIs = matches.map(m => ["<li classID='", m.id, "' i='", m.itemID, "' v=", JSON.stringify(m.name), " u='", m.uses.toString(), "'>", m.name, m.uses >= 0 ? [" <span class='uses'>(", m.uses, ")</span>"].join("") : "", "</li>"].join(""));

                NWS.Util.ReplaceHtml(ul, suggestLIs);
                ulParent.style.display = "block";
            },

            GetCurrent: function (baseID, txtBxCtl) {
                if (!NWS.FilterSupport.TagSuggest.HasResults(baseID))
                    return;

                var ulParent = NWS.Util.Get(baseID + "suggestions").parentNode,
                    selectedLI = NWS.Util.QueryGet("li.hover", ulParent);

                if (!selectedLI)
                    return null;

                return selectedLI;
            },

            HoverNext: function (baseID) {
                if (!NWS.FilterSupport.TagSuggest.HasResults(baseID))
                    return;

                var lis = NWS.Util.QueryGetAll("li", NWS.Util.Get(baseID + "suggestions")),
                    newHover = 0;
                for (i = 0; i < lis.length; i++) {
                    if (lis[i].className === "hover") {
                        lis[i].className = "";
                        newHover = i === (lis.length - 1) ? 0 : i + 1;
                        break;
                    }
                }

                lis[newHover].className = "hover";
            },

            HoverPrev: function (baseID) {
                if (!NWS.FilterSupport.TagSuggest.HasResults(baseID))
                    return;

                var lis = NWS.Util.QueryGetAll("li", NWS.Util.Get(baseID + "suggestions")),
                    newHover = lis.length - 1;
                for (i = 0; i < lis.length; i++) {
                    if (lis[i].className === "hover") {
                        lis[i].className = "";
                        newHover = i === 0 ? lis.length - 1 : i - 1;
                        break;
                    }
                }
                lis[newHover].className = "hover";
            }
        },

        UserRanges: {
            EvalErrorState: function (ctl, isValid) {
                var span = ctl.parentNode,
                    div = span.parentNode;

                span.classList.remove("error");
                div.classList.remove("error");

                if (!isValid) {
                    span.classList.add("error");
                    div.classList.add("error");
                }
            },

            FormatUserRanges: function (blockID) {
                var userRangeFilters = NWS.Util.QueryGetAll("#FilterArea_F" + blockID + "_ fieldset.userValue"),
                    retVal = [];

                for (var i = 0; i < userRangeFilters.length; i++)
                    if (userRangeFilters[i].getAttribute("data-prefix") !== "")
                        retVal.push(JSON.parse(NWS.Util.Get(userRangeFilters[i].getAttribute("data-prefix") + "userRange").value));

                return retVal;
            },

            ParseNumber: function (value) {
                value = value.trim();
                if (value === "")
                    return { value: "", isValid: true };

                return { value: value, isValid: !isNaN(value) };
            },

            ParseFraction: function (value) {
                value = value.trim();
                if (value === "")
                    return { value: "", isValid: true };

                var parts = value.split(" ");
                if (parts.length > 2)
                    return { value: value, isValid: false };

                var retVal = {
                        value: value,
                        isValid: true
                    },
                    frac = [];

                if (parts.length >= 1) {
                    frac = parts[0].split("/");

                    if (frac.length > 2)
                        retVal.isValid = false;

                    if (frac.length === 2) {
                        retVal.isValid = (!isNaN(frac[0]) && !isNaN(frac[1]) && eval(frac[1]) !== 0);

                        if (retVal.isValid)
                            retVal.value = String((eval(frac[0]) / eval(frac[1])).toFixed(4));
                    }

                    if (frac.length === 1) {
                        retVal.isValid = !isNaN(frac[0]);

                        if (retVal.isValid)
                            retVal.value = String(eval(frac[0]).toFixed(4));
                    }
                }

                if (retVal.isValid && parts.length === 2) {
                    frac = parts[1].split("/");

                    if (frac.length !== 2 || frac[0] === "" || frac[1] === "") {
                        retVal.isValid = false;
                        retVal.value = value;
                    }
                    else {
                        retVal.isValid = !isNaN(frac[0]) && !isNaN(frac[1]) && eval(frac[1]) !== 0;
                        retVal.value = retVal.isValid ? String((eval(retVal.value) + (eval(frac[0]) / eval(frac[1]))).toFixed(4)) : value;
                    }
                }

                return retVal;
            },

            Submit: function (blockID, docID) {
                // User Range filters are only available in data list blocks
                var blockPrefix = NWS.FilterSupport.FilterBlock.MakePrefix(blockID);
                NWS.FilterSupport.FilterBlock.GetPageNumCtl(blockPrefix).value = "1";
                NWS.Block.DataList.Submit(blockID, docID);
            },

            SubmitMin: function (blockID, docID, prefix, parseType) {
                var min = NWS.Util.Get(prefix + "minValue"),
                    data = JSON.parse(NWS.Util.Get(prefix + "userRange").value),
                    parseFunc = parseType === "fraction" ? NWS.FilterSupport.UserRanges.ParseFraction : NWS.FilterSupport.UserRanges.ParseNumber,
                    parsed = data.rangeType !== "Number" ? { isValid: true, value: min.value } : parseFunc(min.value);

                NWS.FilterSupport.UserRanges.EvalErrorState(min, parsed.isValid);
                if (!parsed.isValid)
                    return false;

                data.minValue = parsed.value;
                min.value = parsed.value;

                NWS.Util.Get(prefix + "userRange").value = JSON.stringify(data);
                NWS.FilterSupport.UserRanges.Submit(blockID, docID);
            },

            SubmitMax: function (blockID, docID, prefix, parseType) {
                var max = NWS.Util.Get(prefix + "maxValue"),
                    data = JSON.parse(NWS.Util.Get(prefix + "userRange").value),
                    parseFunc = parseType === "fraction" ? NWS.FilterSupport.UserRanges.ParseFraction : NWS.FilterSupport.UserRanges.ParseNumber,
                    parsed = data.rangeType !== "Number" ? { isValid: true, value: max.value } : parseFunc(max.value);

                NWS.FilterSupport.UserRanges.EvalErrorState(max, parsed.isValid);
                if (!parsed.isValid)
                    return;

                data.maxValue = parsed.value;
                max.value = parsed.value;

                NWS.Util.Get(prefix + "userRange").value = JSON.stringify(data);
                NWS.FilterSupport.UserRanges.Submit(blockID, docID);
            },

            SubmitBetween: function (blockID, docID, prefix, parseType) {
                var btwMin = NWS.Util.Get(prefix + "betweenMinValue"),
                    btwMax = NWS.Util.Get(prefix + "betweenMaxValue"),
                    data = JSON.parse(NWS.Util.Get(prefix + "userRange").value),
                    parseFunc = parseType === "fraction" ? NWS.FilterSupport.UserRanges.ParseFraction : NWS.FilterSupport.UserRanges.ParseNumber,
                    parsedMin = data.rangeType !== "Number" ? { isValid: true, value: btwMin.value } : parseFunc(btwMin.value),
                    parsedMax = data.rangeType !== "Number" ? { isValid: true, value: btwMax.value } : parseFunc(btwMax.value);

                NWS.FilterSupport.UserRanges.EvalErrorState(btwMin, parsedMin.isValid);
                if (!parsedMin.isValid)
                    return;

                NWS.FilterSupport.UserRanges.EvalErrorState(btwMax, parsedMax.isValid);
                if (!parsedMax.isValid)
                    return;

                data.betweenMinValue = parsedMin.value;
                btwMin.value = parsedMin.value;
                data.betweenMaxValue = parsedMax.value;
                btwMax.value = parsedMax.value;

                NWS.Util.Get(prefix + "userRange").value = JSON.stringify(data);
                NWS.FilterSupport.UserRanges.Submit(blockID, docID);
            },

            SubmitContains: function (blockID, docID, prefix) {
                let contains = NWS.Util.Get(prefix + "containsValue"),
                    data = JSON.parse(NWS.Util.Get(prefix + "userRange").value);

                data.containsValue = contains.value;

                NWS.Util.Get(prefix + "userRange").value = JSON.stringify(data);
                NWS.FilterSupport.UserRanges.Submit(blockID, docID);
            },

            KeyUp: function (blockID, docID, prefix, parseType, evt) {
                var target = evt.target,
                    attribute = target.getAttribute("data-attrib"),
                    key = evt.which || evt.keyCode;

                evt.preventDefault();

                if (key === 13) {
                    NWS.FilterSupport.RequeryTimer.Clear(target);
                    NWS.FilterSupport.UserRanges.UserValueChanged(attribute, blockID, docID, prefix, parseType);
                    return;
                }

                NWS.FilterSupport.RequeryTimer.KeyUp(target, NWS.FilterSupport.UserRanges.UserValueChanged, [attribute, blockID, docID, prefix, parseType], 500);
            },

            UserValueChanged: function (attribute, blockID, docID, prefix, parseType) {
                switch (attribute) {
                    case "minValue":
                        NWS.FilterSupport.UserRanges.SubmitMin(blockID, docID, prefix, parseType);
                        break;

                    case "maxValue":
                        NWS.FilterSupport.UserRanges.SubmitMax(blockID, docID, prefix, parseType);
                        break;

                    case "betweenMinValue":
                    case "betweenMaxValue":
                        NWS.FilterSupport.UserRanges.SubmitBetween(blockID, docID, prefix, parseType);
                        break;

                    case "containsValue":
                        NWS.FilterSupport.UserRanges.SubmitContains(blockID, docID, prefix);
                        break;
                }
            }
        }
    };
});