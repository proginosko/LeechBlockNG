/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WIDGET_STYLE =
		"position: fixed; z-index: 2147483647; top: 0px; left: 0px; " +
		"margin: 2px; padding: 4px 4px 2px 4px; " +
		"background-color: #FFF; border: solid 1px #808080; border-radius: 4px; " +
		"color: #000; font: normal 12px \"Lucida Console\", \"Monaco\", monospace;";

var tlWidget;

// Creates time left widget
//
function createTimeLeftWidget() {
	tlWidget = document.createElement("div");
	tlWidget.setAttribute("style", WIDGET_STYLE);
	document.body.appendChild(tlWidget);
}

// Updates time left widget
//
function updateTimeLeftWidget(value) {
	if (!tlWidget) {
		createTimeLeftWidget();
	}

	if (!value) {
		tlWidget.hidden = true;
	} else {
		tlWidget.innerText = value;
		tlWidget.hidden = false;
	}
}

/*** EVENT HANDLERS BEGIN HERE ***/

function handleMessage(message, sender) {
	if (message.type == "timeleft") {
		updateTimeLeftWidget(message.content);
	}
}

browser.runtime.onMessage.addListener(handleMessage);
