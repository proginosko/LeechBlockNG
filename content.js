/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const TIMER_DEFAULT_STYLE =
	"position: fixed; z-index: 2147483647; " +
	"top: 0px; left: 0px; margin: 2px; padding: 4px 4px 2px 4px; " +
	"background-color: #fff; color: #000; " +
	"border: solid 1px #000; border-radius: 4px; " +
	"font: normal 12px \"Lucida Console\", Monaco, monospace; " +
	"user-select: none; -moz-user-select: none;";

const TIMER_SIZES = ["10px", "12px", "14px", "16px"];

const TIMER_LOCATIONS = [
	["0px", "", "0px", ""],
	["0px", "", "", "0px"],
	["", "0px", "", "0px"],
	["", "0px", "0px", ""]
];

const ALERT_CONTAINER_STYLE =
	"position: fixed; z-index: 2147483647; display: none; " +
	"top: 0px; left: 0px; width: 100%; height: 100%; " +
	"margin: auto; padding: 0px; " +
	"background-color: transparent;";

const ALERT_BOX_STYLE =
	"margin: auto; padding: 12px; " +
	"line-height: normal; text-align: center; " +
	"background-color: #fff; color: #000; " +
	"border: solid 1px #000; border-radius: 4px; " +
	"font: normal 16px Helvetica, Arial, sans-serif; " +
	"box-shadow: 2px 2px 2px #888; " +
	"user-select: none; -moz-user-select: none;";

const ALERT_ICON_STYLE = "padding: 0px;"

const ALERT_TEXT_STYLE = "padding: 8px 0px 0px 0px;"

const ALERT_ICON = "data:image/png;base64,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";

var gTimer;
var gAlert;

// Update timer
//
function updateTimer(text, size, location) {
	if (!text) {
		if (gTimer) {
			// Hide timer
			gTimer.hidden = true;
		}
	} else {
		if (!gTimer) {
			// Create timer
			gTimer = document.createElement("div");
			gTimer.setAttribute("style", TIMER_DEFAULT_STYLE);
			document.body.appendChild(gTimer);
		}

		// Set text
		gTimer.innerText = text;

		// Set size
		if (size >= 0 && size < TIMER_SIZES.length) {
			gTimer.style.fontSize = TIMER_SIZES[size];
		}

		// Set location
		if (location >= 0 && location < TIMER_LOCATIONS.length) {
			gTimer.style.top = TIMER_LOCATIONS[location][0];
			gTimer.style.bottom = TIMER_LOCATIONS[location][1];
			gTimer.style.left = TIMER_LOCATIONS[location][2];
			gTimer.style.right = TIMER_LOCATIONS[location][3];
		}

		// Show timer
		gTimer.hidden = false;
	}
}

// Show alert message
//
function showAlert(text) {
	let alertBox, alertIcon, alertText;

	if (!gAlert) {
		// Create container
		gAlert = document.createElement("div");
		gAlert.setAttribute("style", ALERT_CONTAINER_STYLE);
		document.body.appendChild(gAlert);

		// Create message box
		alertBox = document.createElement("div");
		alertBox.setAttribute("style", ALERT_BOX_STYLE);
		alertBox.addEventListener("click", hideAlert);
		alertIcon = document.createElement("img");
		alertIcon.setAttribute("style", ALERT_ICON_STYLE);
		alertIcon.setAttribute("src", ALERT_ICON);
		alertBox.appendChild(alertIcon);
		alertText = document.createElement("div");
		alertText.setAttribute("style", ALERT_TEXT_STYLE);
		alertBox.appendChild(alertText);
		gAlert.appendChild(alertBox);
	}

	// Set text
	alertText.innerText = text;

	// Show timer
	gAlert.style.display = "flex";
}

// Hide alert message
//
function hideAlert() {
	if (gAlert) {
		gAlert.style.display = "none";
	}
}

// Check page for keyword(s)
//
function checkKeyword(keywordRE) {
	// Create regular expression (case insensitive)
	let regexp = new RegExp(keywordRE, "i");

	// Get all text nodes in document
	let textNodes = document.evaluate(
		"//text()", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

	//console.log("Checking " + textNodes.snapshotLength + " text node(s) for keyword(s)...");

	for (let i = 0; i < textNodes.snapshotLength; i++) {
		if (regexp.test(textNodes.snapshotItem(i).data)) {
			return true; // keyword(s) found
		}
	}

	return false; // keyword(s) not found
}

/*** EVENT HANDLERS BEGIN HERE ***/

function handleMessage(message, sender, sendResponse) {
	if (message.type == "timer") {
		updateTimer(message.text, message.size, message.location);
	} else if (message.type == "alert") {
		showAlert(message.text);
	} else if (message.type == "keyword") {
		let keyword = checkKeyword(message.keywordRE);
		sendResponse(keyword);
	}
}

browser.runtime.onMessage.addListener(handleMessage);
