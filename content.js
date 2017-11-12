/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WIDGET_DEFAULT_STYLE =
		"position: fixed; z-index: 2147483647; top: 0px; left: 0px; " +
		"margin: 2px; padding: 4px 4px 2px 4px; " +
		"background-color: #FFF; color: #000; " +
		"border: solid 1px #808080; border-radius: 4px; " +
		"font: normal 12px \"Lucida Console\", \"Monaco\", monospace; " +
		"user-select: none; -moz-user-select: none;";

const WIDGET_SIZES = ["10px", "12px", "14px", "16px"];

const WIDGET_LOCATIONS = [
	["0px", "", "0px", ""],
	["0px", "", "", "0px"],
	["", "0px", "", "0px"],
	["", "0px", "0px", ""]
];

var tlWidget;

// Create time left widget
//
function createTimeLeftWidget() {
	tlWidget = document.createElement("div");
	tlWidget.setAttribute("style", WIDGET_DEFAULT_STYLE);
	document.body.appendChild(tlWidget);
}

// Update time left widget
//
function updateTimeLeftWidget(text, size, location) {
	if (!tlWidget) {
		createTimeLeftWidget();
	}

	if (!text) {
		tlWidget.hidden = true;
	} else {
		tlWidget.innerText = text;
		if (size >= 0 && size < WIDGET_SIZES.length) {
			tlWidget.style.fontSize = WIDGET_SIZES[size];
		}
		if (location >= 0 && location < WIDGET_LOCATIONS.length) {
			tlWidget.style.top = WIDGET_LOCATIONS[location][0];
			tlWidget.style.bottom = WIDGET_LOCATIONS[location][1];
			tlWidget.style.left = WIDGET_LOCATIONS[location][2];
			tlWidget.style.right = WIDGET_LOCATIONS[location][3];
		}
		tlWidget.hidden = false;
	}
}

/*** EVENT HANDLERS BEGIN HERE ***/

function handleMessage(message, sender) {
	if (message.type == "timeleft") {
		updateTimeLeftWidget(message.text, message.size, message.location);
	}
}

browser.runtime.onMessage.addListener(handleMessage);
