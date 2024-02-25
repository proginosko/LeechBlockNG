/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

// Initialize form (with specified number of block sets)
//
function initForm() {
	//log("initForm");

	// Clear drop-down list of block sets
	$("#blockSet").html("");

	// Set up JQuery UI widgets
	$("#addSites").button();
	$("#addSites").click(onAddSites);
	$("#cancel").button();
	$("#cancel").click(onCancel);
}

// Refresh page
//
function refreshPage() {
	//log("refreshPage");

	$("#form").hide();

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

		let numSets = +options["numSets"];

		// Initialize form
		initForm();

		setTheme(options["theme"]);

		// Update drop-down list of block sets
		let blockSetHTML = "";
		for (let set = 1; set <= numSets; set++) {
			blockSetHTML += `<option value="${set}">Block Set ${set}`;
			let setName = options[`setName${set}`];
			if (setName) {
				blockSetHTML += ` (${setName})`;
			}
			blockSetHTML += "</option>";
		}
		$("#blockSet").html(blockSetHTML);

		$("#form").show();
	}

	function onError(error) {
		warn("Cannot get options: " + error);
		$("#alertRetrieveError").dialog("open");
	}
}

// Handle add button click
//
function onAddSites() {
	//log("onAddSites");

	let sites = cleanSites(getElement("sites").value);
	let blockSet = getElement("blockSet").value;

	let message = {
		type: "add-sites",
		sites: sites,
		set: blockSet
	};
	// Request add sites for this set
	browser.runtime.sendMessage(message);

	$("#form").hide({ effect: "fade", complete: closePage });
}

// Handle cancel button click
//
function onCancel() {
	//log("onCancel");

	closePage();
}

// Close page
//
function closePage() {
	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
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

document.addEventListener("DOMContentLoaded", refreshPage);
document.addEventListener("focus", refreshPage);
