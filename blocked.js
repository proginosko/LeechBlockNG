/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gBlockInfo;

// Processes info for blocking/delaying page
//
function processBlockInfo(info) {
	if (!info) return;

	gBlockInfo = info;

	if (info.theme) {
		// Set theme
		let link = document.getElementById("themeLink");
		if (link) {
			link.href = info.theme ? `themes/${info.theme}.css` : "";
		}
	}

	let blockedURL = document.getElementById("lbBlockedURL");
	if (info.blockedURL && blockedURL) {
		if (info.blockedURL.length > 60) {
			blockedURL.innerText = info.blockedURL.substring(0, 57) + "...";
		} else {
			blockedURL.innerText = info.blockedURL;
		}
	}

	let blockedURLLink = document.getElementById("lbBlockedURLLink");
	if (info.blockedURL && blockedURLLink) {
		blockedURLLink.setAttribute("href", info.blockedURL);
	}

	let blockedSet = document.getElementById("lbBlockedSet");
	if (info.blockedSet && blockedSet) {
		if (info.blockedSetName) {
			blockedSet.innerText = info.blockedSetName;
		} else {
			blockedSet.innerText += " " + info.blockedSet;
		}
		document.title += " (" + blockedSet.innerText + ")";
	}

	let unblockTime = document.getElementById("lbUnblockTime");
	if (info.unblockTime && unblockTime) {
		unblockTime.innerText = info.unblockTime;
	}

	let loadedText = document.getElementById("lbLoaded");
	let availableText = document.getElementById("lbAvailable");
	if (info.delayPickDuration && loadedText && availableText) {
		loadedText.style = "display: none;";
		availableText.style = "display: inline;";
	}

	let durationSelect = document.getElementById("durationSelect");
	if (info.delayPickDuration && info.delayMaxDuration && durationSelect) {
		durationSelect.onchange = function() { pickDuration(this.value); };

		// Right now the select just contains the null element so fill it up with options
		addDelayAllowDurationsToSelectElement(durationSelect, info.delayMaxDuration);
	}

	let delaySecs = document.getElementById("lbDelaySeconds");
	if (info.delaySecs && delaySecs) {
		delaySecs.innerText = info.delaySecs;

		// Start countdown timer
		let countdown = { delaySecs: info.delaySecs };
		countdown.interval = window.setInterval(onCountdownTimer, 1000, countdown);
	}

	if (info.reloadSecs) {
		// Reload blocked page after specified time
		window.setTimeout(reloadBlockedPage, info.reloadSecs * 1000);
	}
}

// Handle countdown on delaying page
//
function onCountdownTimer(countdown) {
	// Cancel countdown if document not focused
	if (!document.hasFocus()) {
		// Clear countdown timer
		window.clearInterval(countdown.interval);

		// Strike through countdown text
		let countdownText = document.getElementById("lbCountdownText");
		if (countdownText) {
			countdownText.style.textDecoration = "line-through";
		}

		return;
	}

	countdown.delaySecs--;

	// Update countdown seconds on page
	let delaySecs = document.getElementById("lbDelaySeconds");
	if (delaySecs) {
		delaySecs.innerText = countdown.delaySecs;
	}

	if (countdown.delaySecs == 0) {
		// Clear countdown timer
		window.clearInterval(countdown.interval);
		
		// Present duration choice if appropriate and otherwise allow page
		let pickDuration = document.getElementById("pickDuration");
		let countdownText = document.getElementById("lbCountdownText");
		if (gBlockInfo.delayPickDuration && pickDuration && countdownText) {
			// Let the user pick a duration
			pickDuration.style = "display: block;";
			countdownText.style = "display: none;";
		} else {
			// Request extension allow blocked page and redirect
			let message = {
				type: "delayed",
				blockedURL: gBlockInfo.blockedURL,
				blockedSet: gBlockInfo.blockedSet
			};
			browser.runtime.sendMessage(message);
		}
	}
}

// Handle user selecting a duration
//
function pickDuration(value) {
	if (value == "") return;
	secs = Number(value) * 60;

	// Request extension allow the set for duration and redirect
	let message = {
		type: "delayed",
		blockedURL: gBlockInfo.blockedURL,
		blockedSet: gBlockInfo.blockedSet,
		pickedAllowSecs: secs
	};
	browser.runtime.sendMessage(message);
}

// Attempt to reload blocked page
//
function reloadBlockedPage() {
	let blockedURLLink = document.getElementById("lbBlockedURLLink");
	if (blockedURLLink) {
		blockedURLLink.click();
	}
}

// Request block info from extension
browser.runtime.sendMessage({ type: "blocked" }).then(processBlockInfo);
