/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

// Initialize form
//
function initializeForm() {
	//log("initializeForm");

	browser.storage.local.get().then(onGot, onError);

	function onGot(options) {
		for (let set = 1; set <= NUM_SETS; set++) {
			// Append custom set name to check box label (if specified)
			let setName = options[`setName${set}`];
			if (setName) {
				document.querySelector(`#siteLabel${set}`).innerText += ` (${setName})`;
			}
		}
	}

	function onError(error) {
		warn("Cannot get options: " + error);
	}
}

// Handle activate button click
//
function onActivate() {
	//log("onActivate");

	// Get lockdown duration
	let hours = document.querySelector("#hours").value;
	let mins = document.querySelector("#mins").value;
	let duration = hours * 3600 + mins * 60;

	if (!duration) {
		$("#alertNoDuration").dialog("open");
		return;
	}

	// Calculate end time for lockdown	
	let endTime = Math.floor(Date.now() / 1000) + duration;

	// Request lockdown for each selected set
	let noneSelected = true;
	for (let set = 1; set <= NUM_SETS; set++) {
		let selected = document.querySelector(`#site${set}`).checked;
		if (selected) {
			noneSelected = false;
			let message = {
				type: "lockdown",
				endTime: endTime,
				set: set
			};
			// Request lockdown for this set
			browser.runtime.sendMessage(message);
		}
	}

	if (noneSelected) {
		$("#alertNoSets").dialog("open");
		return;
	}

	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
}

// Handle cancel button click
//
function onCancel() {
	//log("onCancel");

	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
}

/*** STARTUP CODE BEGINS HERE ***/

// Use HTML for first check box to create other check boxes
let siteHTML = $("#sites").html();
for (let set = 2; set <= NUM_SETS; set++) {
	let nextSiteHTML = siteHTML
			.replace(/Block Set 1/g, `Block Set ${set}`)
			.replace(/(id|for)="(\w+)1"/g, `$1="$2${set}"`);
	$("#sites").append(nextSiteHTML);
}

// Set up JQuery UI widgets
$("#activate").button();
$("#activate").click(onActivate);
$("#cancel").button();
$("#cancel").click(onCancel);

let alerts = ["alertNoDuration", "alertNoSets"];
for (let alert of alerts) {
	$(`#${alert}`).dialog({
		autoOpen: false,
		modal: true,
		buttons: {
			OK: function() { $(this).dialog("close"); }
		}
	});
}

$("#form").show();

document.addEventListener("DOMContentLoaded", initializeForm);
