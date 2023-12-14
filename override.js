/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const LIMIT_PERIOD = {
	"3600": "this hour",
	"86400": "today",
	"604800": "this week"
};

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

var gAccessConfirmed = false;
var gAccessRequiredInput;
var gClockOffset;
var gOverrideConfirm;
var gOverrideMins;
var gOverrideLimit = false;
var gOverrideLimitPeriod;
var gOverrideLimitLeft;
var gOverrideSetNames = [];
var gClockTimeOpts;

// Initialize form
//
function initForm() {
	//log("initForm");

	// Set up JQuery UI widgets
	$("#activate").button();
	$("#activate").click(activateOverride);
	$("#cancel").button();
	$("#cancel").click(closePage);
}

// Initialize page
//
function initializePage() {
	//log("initializePage");

	browser.storage.local.get("sync").then(onGotSync, onError);

	function onGotSync(options) {
		if (options["sync"]) {
			browser.storage.sync.get().then(onGot, onError);
		} else {
			browser.storage.local.get().then(onGot, onError);
		}
	}

	function onGot(options) {
		cleanOptions(options);

		// Initialize form
		initForm();

		setTheme(options["theme"]);

		// Get clock time format
		gClockTimeOpts = {};
		let clockTimeFormat = options["clockTimeFormat"];
		if (clockTimeFormat > 0) {
			gClockTimeOpts.hour12 = (clockTimeFormat == 1);
		}

		gClockOffset = options["clockOffset"];

		gOverrideConfirm = options["orc"];
		gOverrideMins = options["orm"];

		// Check override limit (if specified)
		let orln = options["orln"];
		let orlp = options["orlp"];
		let orlps = options["orlps"];
		let orlc = options["orlc"];
		if (orln && orlp) {
			gOverrideLimit = true;
			gOverrideLimitPeriod = LIMIT_PERIOD[orlp];
			gOverrideLimitLeft = Math.max(0, orln - orlc);
			let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);
			let periodStart = getTimePeriodStart(now, orlp);
			if (orlps == periodStart && gOverrideLimitLeft == 0) {
				$("#alertLimitNum").html(orln);
				$("#alertLimitReachedPeriod").html(gOverrideLimitPeriod);
				$("#alertLimitReached").dialog("open");
				return;
			} else if (orlps != periodStart) {
				gOverrideLimitLeft = orln;
			}
		}

		// Get list of sets to override
		let numSets = +options["numSets"];
		for (let set = 1; set <= numSets; set++) {
			if (options[`allowOverride${set}`]) {
				let setName = options[`setName${set}`];
				if (setName) {
					gOverrideSetNames.push(`Block Set ${set} (${setName})`);
				} else {
					gOverrideSetNames.push(`Block Set ${set}`);
				}
			}
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

// Set focus to minutes input field
//
function focusMins() {
	$("#mins").focus();
}

// Confirm access to override
//
function confirmAccess(options) {
	let ora = options["ora"];
	let orp = options["orp"];
	let code = options["orcode"];
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
	} else if (ora == 8 && code) {
		gAccessRequiredInput = code;
		numLines = displayAccessCode(code, options["accessCodeImage"]);
		resizePromptInputHeight(numLines);
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else if (ora == 9 && orp) {
		gAccessRequiredInput = orp;
		$("#promptPasswordInput").attr("type", "password");
		$("#promptPasswordInput").val("");
		$("#promptPassword").dialog("open");
		$("#promptPasswordInput").focus();
	} else if (ora >= 2 && ora <= 4) {
		let code = createAccessCode(32);
		if (ora > 2) {
			code += createAccessCode(32);
		}
		if (ora > 3) {
			code += createAccessCode(64);
		}
		gAccessRequiredInput = code;
		numLines = displayAccessCode(code, options["accessCodeImage"]);
		resizePromptInputHeight(numLines);
		$("#promptAccessCodeInput").val("");
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else if (gOverrideMins) {
		// Override duration already specified in General options
		activateOverride();
	} else {
		// Override duration not specified in General options
		$("#form").show();
		setTimeout(focusMins, 100);
	}
}

// Display access code (as text or image)
//
function displayAccessCode(code, asImage) {
	let codeText = getElement("promptAccessCodeText");
	let codeImage = getElement("promptAccessCodeImage");
	let codeCanvas = getElement("promptAccessCodeCanvas");

	let lines = [];
	let idx = 0;
	do {
		let spaceIdx = (idx + 64 >= code.length) ? code.length : code.lastIndexOf(" ", idx + 64);
		if (spaceIdx == -1) {
			lines.push(code.substring(idx, idx + 64));
			idx += 64;
		} else {
			lines.push(code.substring(idx, spaceIdx));
			idx = spaceIdx + 1;
		}
	} while (idx < code.length - 1);

	if (asImage) {
		// Display code as image
		codeText.style.display = "none";
		codeImage.style.display = "";
		let ctx = codeCanvas.getContext("2d");
		ctx.font = "normal 14px monospace";
		let width = ctx.measureText(code.substring(0, 64)).width + 8;
		let height = lines.length * 16 + 8;
		codeCanvas.width = width * devicePixelRatio;
		codeCanvas.height = height * devicePixelRatio;
		ctx.scale(devicePixelRatio, devicePixelRatio);
		codeCanvas.style.width = width + 'px';
		codeCanvas.style.height = height + 'px';
		ctx.font = "normal 14px monospace"; // resizing canvas resets font!
		ctx.fillStyle = "#000";
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], 4, 16 * (i+1));
		}
	} else {
		// Display code as text
		codeText.style.display = "";
		codeImage.style.display = "none";
		for (let i = 0; i < lines.length; i++) {
			codeText.appendChild(document.createTextNode(lines[i]));
			codeText.appendChild(document.createElement("br"));
		}
	}

	return lines.length;
}

// Convert #promptAccessCodeInput to a textarea and resize its height based
// on the number of lines of the access code
//
function resizePromptInputHeight(numLines) {
	if (numLines < 2) return;
	let codeInput = getElement("promptAccessCodeInput");
	let textarea = document.createElement("textarea");
	textarea.id = codeInput.id;
	textarea.font = codeInput.font;
	textarea.rows = numLines;
	textarea.cols = codeInput.size;
	codeInput.replaceWith(textarea);
}

// Activate override
//
function activateOverride() {
	// Get duration from form if not already specified
	if (!gOverrideMins) {
		gOverrideMins = $("#mins").val();
		if (!gOverrideMins || !checkPosIntFormat(gOverrideMins)) {
			gOverrideMins = "";
			$("#mins").val("");
			$("#alertNoDuration").dialog("open");
			return;
		}
	}

	// Calculate end time for override
	let endTime = Math.floor(Date.now() / 1000) + (gClockOffset * 60) + (gOverrideMins * 60);

	// Request override
	let message = {
		type: "override",
		endTime: endTime
	};
	browser.runtime.sendMessage(message);

	if (gOverrideConfirm) {
		// Show confirmation dialog
		endTime = new Date(endTime * 1000);
		$("#alertOverrideEndTime").html(endTime.toLocaleTimeString(undefined, gClockTimeOpts));
		if (gOverrideSetNames.length > 0) {
			$("#alertOverrideNoSets").hide();
			$("#alertOverrideSets").show();
			$("#alertOverrideSetList").html("<ul><li>" + gOverrideSetNames.join("</li><li>") + "</li></ul>");
		}
		if (gOverrideLimit) {
			$("#alertOverrideLimit").show();
			$("#alertLimitLeft").html(gOverrideLimitLeft - 1);
			$("#alertLimitPeriod").html(gOverrideLimitPeriod);
		}
		$("#alertOverrideActivated").dialog("open");
	} else {
		// Close page immediately (no confirmation dialog)
		closePage();
	}
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
				if (gOverrideMins) {
					// Slight delay to allow focus to pass to new dialog
					setTimeout(activateOverride, 100);
				} else {
					$("#form").show();
					setTimeout(focusMins, 100);
				}
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
		OK: function () { $(this).dialog("close"); }
	}
});
$("#alertLimitReached").dialog({
	close: function (event, ui) { closePage(); }
});
$("#alertOverrideActivated").dialog({
	close: function (event, ui) { closePage(); }
});

// Initialize access control prompts
initAccessControlPrompt("promptPassword");
initAccessControlPrompt("promptAccessCode");

document.addEventListener("DOMContentLoaded", initializePage);
