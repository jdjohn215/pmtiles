NWS.initNamespace("NWS.Block.SearchResults", function () {
    return {
        Init: function (blockID) {
            var useSearchAnchor = NWS.Util.Get("Search_Anchor" + blockID);
            if (!useSearchAnchor)
                return;
            
            if (useSearchAnchor.value === "1")
                window.location.hash = "Search_Results" + blockID;
        },

        LogResultClick: function (blockID, evt) {
            var target = evt.target;
            if (target.tagName === "IMG")
                target = target.parentNode;
            if (target.tagName !== "A" || !target.hasAttribute("ResultID"))
                return;

            var args = {
                resultID: target.getAttribute("ResultID"),
                searchPhrase: NWS.Util.Get("Search_Keywords" + blockID).value
            };
            NWS.Ajax.Post("/Blocks/SearchResults/Support/SearchResultsAjax/LogResultClick", args, "text", null);
        },

        PageEvent: function (blockID, pageNum) {
            NWS.Util.Event.CancelInline(this.PageEvent, true);

            NWS.Util.Get("Search_Anchor" + blockID).value = 1;
            NWS.Util.Get("Search_PageNum" + blockID).value = pageNum;
            document.forms["routerForm"].submit();
        }
    };
});