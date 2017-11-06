/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Processes info for blocking/delaying page
//
function processBlockInfo(info) {
	if (!info) return;

	let blockedURLSpan = document.getElementById("leechblockBlockedURLSpan");
	if (info.blockedURL && blockedURLSpan) {
		if (info.blockedURL.length > 60) {
			blockedURLSpan.innerText = info.blockedURL.substring(0, 57) + "...";
		} else {
			blockedURLSpan.innerText = info.blockedURL;
		}
	}

	let blockedURLLink = document.getElementById("leechblockBlockedURLLink");
	if (info.blockedURL && blockedURLLink) {
		blockedURLLink.setAttribute("href", info.blockedURL);
	}

	let blockedSetSpan = document.getElementById("leechblockBlockedSetSpan");
	if (info.blockedSet && info.blockedSetName && blockedSetSpan) {
		if (info.blockedSetName != "") {
			blockedSetSpan.innerText = info.blockedSetName;
		} else {
			blockedSetSpan.innerText += " " + info.blockedSet;
		}
	}

	let unblockTimeSpan = document.getElementById("leechblockUnblockTimeSpan");
	if (info.unblockTime && unblockTimeSpan) {
		unblockTimeSpan.innerText = info.unblockTime;
	}

	let delaySecsSpan = document.getElementById("leechblockDelaySecondsSpan");
	if (info.delaySecs && delaySecsSpan) {
		delaySecsSpan.innerText = info.delaySecs;

		// Start countdown timer
		let countdown = {
			blockedURL: info.blockedURL,
			blockedSet: info.blockedSet,
			delaySecs: info.delaySecs
		};
		countdown.interval = window.setInterval(onCountdownTimer, 1000, countdown);
	}
}

// Handle countdown on delaying page
//
function onCountdownTimer(countdown) {
	// Advance countdown if document has focus
	if (document.hasFocus()) {
		countdown.delaySecs--;
	}

	// Update countdown seconds on page
	let delaySecsSpan = document.getElementById("leechblockDelaySecondsSpan");
	if (delaySecsSpan) {
		delaySecsSpan.innerText = countdown.delaySecs;
	}

	if (countdown.delaySecs == 0) {
		// Clear countdown timer
		window.clearInterval(countdown.interval);

		// Request extension allow blocked page and redirect
		let message = {
			type: "delayed",
			blockedURL: countdown.blockedURL,
			blockedSet: countdown.blockedSet
		};
		browser.runtime.sendMessage(message);
	}
}

// Request block info from extension
browser.runtime.sendMessage({ type: "blocked" }).then(processBlockInfo);
