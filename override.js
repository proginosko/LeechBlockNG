/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

var gAccessConfirmed = false;
var gAccessRequiredInput;
var gOverrideMins;

// Initialize page
//
function initializePage() {
	//log("initializePage");

	browser.storage.local.get().then(onGot, onError);

	function onGot(options) {
		gOverrideMins = options["orm"];
	
		if (!gOverrideMins) {
			$("#alertNoOverride").dialog("open");
			return;
		}

		confirmAccess(options);
	}

	function onError(error) {
		warn("Cannot get options: " + error);
		$("#alertRetrieveError").dialog("open");
	}
}

// Close page
//
function closePage() {
	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
}

// Confirm access to override
//
function confirmAccess(options) {
	let ora = options["ora"];
	let password = options["password"];
	let hpp = options["hpp"];

	if (ora == 1 && password) {
		gAccessRequiredInput = password;
		if (hpp) {
			$("#promptPasswordInput").attr("type", "password");
		} else {
			$("#promptPasswordInput").attr("type", "text");
		}
		$("#promptPasswordInput").val("");
		$("#promptPassword").dialog("open");
		$("#promptPasswordInput").focus();
	} else if (ora > 1) {
		let code = createAccessCode(32);
		let codeText = code;
		gAccessRequiredInput = code;
		if (ora > 2) {
			code = createAccessCode(32);
			codeText += code;
			gAccessRequiredInput += code;
		}
		if (ora > 3) {
			code = createAccessCode(32);
			codeText += "<br>" + code;
			gAccessRequiredInput += code;
			code = createAccessCode(32);
			codeText += code;
			gAccessRequiredInput += code;
		}
		$("#promptAccessCodeText").html(codeText);
		$("#promptAccessCodeInput").val("");
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else {
		activateOverride();
	}
}

// Activate override
//
function activateOverride() {
	// Calculate end time
	let endTime = new Date(Date.now() + gOverrideMins * 60000);

	// Show confirmation dialog
	$("#alertOverrideEndTime").html(endTime.toLocaleTimeString());
	$("#alertOverrideActivated").dialog("open");

	// Request override
	browser.runtime.sendMessage({ type: "override" });
}

// Initialize access control prompt
//
function initAccessControlPrompt(prompt) {
	// Create functions for buttons
	let dialogButtons = {
		OK: function () {
			let input = $(`#${prompt}Input`);
			if (input.val() == gAccessRequiredInput) {
				gAccessConfirmed = true;
				activateOverride();
				$(`#${prompt}`).dialog("close");
			} else {
				input.val("");
				input.effect({ effect: "highlight", color: "#ff0000" });
				input.focus();
			}
		},
		Cancel: function () {
			$(`#${prompt}`).dialog("close");
		}
	};

	// Initialize prompt dialog
	$(`#${prompt}`).dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		buttons: dialogButtons,
		close: function (event, ui) { if (!gAccessConfirmed) closePage(); }
	});

	// Connect ENTER key to OK button
	$(`#${prompt}Input`).keydown(
		function (event) {
			if (event.which == 13) {
				dialogButtons.OK();
			}
		}
	);
}

/*** STARTUP CODE BEGINS HERE ***/

// Initialize alert dialogs
$("div[id^='alert']").dialog({
	autoOpen: false,
	modal: true,
	width: 500,
	buttons: {
		OK: function () { $(this).dialog("close"); closePage(); }
	}
});

// Initialize access control prompts
initAccessControlPrompt("promptPassword");
initAccessControlPrompt("promptAccessCode");

document.addEventListener("DOMContentLoaded", initializePage);
