NWS.initNamespace("NWS.Block.Comments", function () {
    var _ = {
        commentLimit: function (ctl, numChars) {
            var baseID = ctl.id,
                limitSpanCtl = document.getElementById(baseID + "_Count");

            if (ctl.value.length > numChars)
                ctl.value = ctl.value.substring(0, numChars);

            if (limitSpanCtl)
                limitSpanCtl.innerHTML = String(numChars - ctl.value.length);
        },

        CheckForInvisibleRecaptchaComment: function() {
            // If we haven't set up the HTML correctly to use the invisible captcha system, then just submit the
            // form and return.
            var docID = document.getElementById("cmsForms_DocID").value;
            if (!document.getElementById("cmsForms_CommentingCaptchaEnabled_Comment_" + docID) ||
                document.getElementById("cmsForms_CommentingCaptchaEnabled_Comment_" + docID).value !== "1") {
                NWS.Block.Comments.CRValidateAndSubmitHandler();
                return;
            }

            if (!document.getElementById("recaptcha-container-comment-" + docID)) {
                NWS.Block.Comments.CRValidateAndSubmitHandler();
                return;
            }

            // We have all the parts for the invisible recaptcha to work.  Execute the check and return.
            var recaptchaDisplayType = document.getElementById("recaptcha-container-comment-" + docID).getAttribute("data-displaytype");
            if (recaptchaDisplayType && recaptchaDisplayType === 'invisible') {
                var recaptchaID = document.getElementById('recaptcha-widget-id-comment-' + docID).value;
                grecaptcha.execute(recaptchaID);
                return;
            }

            NWS.Block.Comments.CRValidateAndSubmitHandler();
        },

        ShowHideById: function (ctlID, doShow) {
            var ctl = document.getElementById(ctlID);
            if (ctl)
                ctl.style.display = doShow ? "block" : "none";
        }
    };

    return {
        Init: function () {
            if (!window["CRCommentLimit"])
                window["CRCommentLimit"] = _.commentLimit;
        },

        CRValidateAndSubmit: function () {
            if (NWS.FormSupport.ClientSideCaptchaValidate) {
                _.CheckForInvisibleRecaptchaComment();
                return;
            }

            NWS.Block.Comments.CRValidateAndSubmitHandler();    
        },

        CRValidateAndSubmitHandler: function () {
            var docID = document.getElementById("cmsForms_DocID").value;
            var containerControl = document.getElementById("titanComments_CommentForm");
            if (!containerControl)
                return window.alert("Commenting form container is missing");

            _.ShowHideById("titanComments_CommentForm", false);
            var allPassed = true;

            if (window["CommentRating_UserSuppliedValidation"])
                allPassed &= CommentRating_UserSuppliedValidation();

            allPassed &= NWS.FormSupport.ActionByType("select", "validate", containerControl, null);
            allPassed &= NWS.FormSupport.ActionByType("input", "validate", containerControl, null);
            allPassed &= NWS.FormSupport.ActionByType("textarea", "validate", containerControl, null);

            if (document.getElementById("cmsForms_TitanRatingReCaptchaZone_Comment_" + docID))
                allPassed &= NWS.FormSupport.ClientSideCaptchaValidate('Comment_' + docID, 'comment-' + docID);

            if (!allPassed) {
                NWS.FormSupport.SFMessageAreaFinalAdjust(null);
                NWS.FormSupport.ResetCaptcha("comment-" + docID);
                return _.ShowHideById("titanComments_CommentForm", true);
            }

            var packagedData = [
                NWS.Xml.MakeStartTag("Data", null, false),
                NWS.FormSupport.PackageByType("select", containerControl),
                NWS.FormSupport.PackageByType("input", containerControl),
                NWS.FormSupport.PackageByType("textarea", containerControl),
                NWS.Xml.MakeStartTag("Captcha", null, false),
                NWS.FormSupport.ExtractCaptchaInfo(containerControl, "Comment_" + docID),
                NWS.Xml.MakeEndTag("Captcha", false),
                NWS.Xml.MakeEndTag("Data", false)
            ].join("");

            var ajaxArgs = { docID: docID, encodedData: NWS.Ajax.UrlToken.Encode(packagedData) },
                callback = NWS.Ajax.QueuedCallback("Commenting", function (result) { NWS.Block.Comments.CRSaveComplete(result.response); });

            NWS.FormSupport.SFRespondToValidation(true, "captcha", "", "cmsForms_TitanRatingReCaptchaZone_Comment_" + docID, null);
            NWS.Ajax.Post("/Blocks/Commenting/Support/CommentingAjax/ProcessComment", ajaxArgs, "json", callback);
        },

        CRSaveComplete: function (results) {
            if (!results.status) {
                _.ShowHideById("titanComments_CommentForm", true);
                NWS.FormSupport.SFRespondToValidation(false, "formsubmit", results.message, "cmsForms_TitanRatingReCaptchaZone", null);
            }
            else if (document.getElementById("titanComments_Confirmation"))
                _.ShowHideById("titanComments_Confirmation", true);
            else
                document.location.href = document.location.href;

            if (NWS.FormSupport.ResetCaptcha)
                NWS.FormSupport.ResetCaptcha("comment-" + document.getElementById("cmsForms_DocID").value);
        }
    };
});