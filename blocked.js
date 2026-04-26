/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gBlockedURL;
var gBlockedSet;
var gHashCode;

// Create 32-bit integer hash code from string
//
function hashCode32(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
	}
	return hash;
}

// Processes info for blocking page
//
function processBlockInfo(info) {
	if (!info) return;

	console.log("unblockTime raw:", info.unblockTime);

	gBlockedURL = info.blockedURL;
	gBlockedSet = info.blockedSet;
	gHashCode = info.password ? hashCode32(info.password) : 0;

	// Set theme
	let themeLink = document.getElementById("themeLink");
	if (themeLink) {
		themeLink.href = "/themes/" + (info.theme ? `${info.theme}.css` : "default.css");
	}

	// Set custom style
	let customStyle = document.getElementById("customStyle");
	if (customStyle) {
		customStyle.innerText = info.customStyle;
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
	if (info.blockedURL && blockedURLLink && !info.disableLink) {
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

	let keywordMatched = document.getElementById("lbKeywordMatched");
	let keywordMatch = document.getElementById("lbKeywordMatch");
	if (keywordMatched && keywordMatch) {
		if (info.keywordMatch) {
			keywordMatch.innerText = info.keywordMatch;
			keywordMatched.style.display = "";
		} else {
			keywordMatched.style.display = "none";
		}
	}

	let passwordInput = document.getElementById("lbPasswordInput");
	let passwordSubmit = document.getElementById("lbPasswordSubmit");
	if (passwordInput && passwordSubmit) {
		passwordInput.focus();
		passwordSubmit.onclick = onSubmitPassword;
	}

	let customMsgDiv = document.getElementById("lbCustomMsgDiv");
	let customMsg = document.getElementById("lbCustomMsg");
	if (customMsgDiv && customMsg) {
		if (info.customMsg) {
			customMsg.innerText = info.customMsg;
			customMsgDiv.style.display = "";
		} else {
			customMsgDiv.style.display = "none";
		}
	}

	let unblockTime = document.getElementById("lbUnblockTime");
	if (info.unblockTime && unblockTime) {
		unblockTime.innerText = info.unblockTime;
	}

	// ----- FEATURE 1: COUNTDOWN -----
	let countdownEl = document.getElementById("lbCountdown");
	let countdownText = document.getElementById("lbCountdownText");

	if (info.unblockTime && countdownEl) {
		function parseTimeString(timeStr) {
			let now = new Date();

			let parts = timeStr.trim().split(" ");
			if (parts.length !== 2) return NaN;

			let [time, modifier] = parts;
			let timeParts = time.split(":").map(Number);

			if (timeParts.length < 2) return NaN;

			let hours = timeParts[0];
			let minutes = timeParts[1];
			let seconds = timeParts[2] || 0;

			if (isNaN(hours) || isNaN(minutes)) return NaN;

			if (modifier === "PM" && hours !== 12) hours += 12;
			if (modifier === "AM" && hours === 12) hours = 0;

			return new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
				hours,
				minutes,
				seconds
			).getTime();
		}

		let endTime = parseTimeString(info.unblockTime);
		if (isNaN(endTime)) {
			console.error("Bad unblockTime format:", info.unblockTime);
			countdownEl.innerText = "Invalid time";
			return;
		}
		let startTime = Date.now();
		let totalDuration = endTime - startTime;

		function updateCountdown() {
			let now = Date.now();
			let diff = endTime - now;

			if (diff <= 0) {
				countdownEl.innerText = "Unblocking...";
				clearInterval(timer);
				return;
			}

			// text
			countdownEl.innerText = formatRemaining(diff);

			// progress
			let progress = (totalDuration - diff) / totalDuration;
			progress = Math.max(0, Math.min(1, progress));

			let bar = document.getElementById("lbProgressBar");
			let percent = document.getElementById("lbProgressPercent");

			if (bar) {
				bar.style.width = (progress * 100) + "%";
			}

			if (percent) {
				percent.innerText = Math.round(progress * 100) + "% completed";
			}
		}

		updateCountdown();
		let timer = setInterval(updateCountdown, 1000);

	} else if (countdownText) {
		countdownText.style.display = "none";
	}

	let delaySecs = document.getElementById("lbDelaySeconds");
	if (info.delaySecs && delaySecs) {
		delaySecs.innerText = info.delaySecs;

		// Start countdown timer
		let countdown = {
			delaySecs: info.delaySecs,
			delayCancel: info.delayCancel
		};
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
	if (countdown.delayCancel && !document.hasFocus()) {
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

		// Notify extension that delay countdown has completed
		let message = {
			type: "delayed",
			blockedURL: gBlockedURL,
			blockedSet: gBlockedSet
		};
		browser.runtime.sendMessage(message);
	}
}

// Handle submit button on password page
//
function onSubmitPassword() {
	let passwordInput = document.getElementById("lbPasswordInput");
	if (hashCode32(passwordInput.value) == gHashCode) {
		// Notify extension that password was successfully entered
		let message = {
			type: "password",
			blockedURL: gBlockedURL,
			blockedSet: gBlockedSet
		};
		browser.runtime.sendMessage(message);
	} else {
		// Clear input field and flash background
		passwordInput.value = "";
		passwordInput.classList.add("error");
		window.setTimeout(() => { passwordInput.classList.remove("error"); }, 400);
	}
}

// Attempt to reload blocked page
//
function reloadBlockedPage() {
	if (gBlockedURL) {
		document.location.href = gBlockedURL;
	}
}
//
//
function formatRemaining(ms) {
	if (ms <= 0) return "0 minutes";

	let totalSeconds = Math.floor(ms / 1000);

	let hours = Math.floor(totalSeconds / 3600);
	let minutes = Math.floor((totalSeconds % 3600) / 60);
	let seconds = totalSeconds % 60;

	let parts = [];

	if (hours > 0) {
		parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
	}

	if (minutes > 0) {
		parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
	}

	// optional: only show seconds if under 1 minute remaining
	if (hours === 0 && minutes < 5) {
		parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
	}

	return parts.join(" ");
}

// Request block info from extension
browser.runtime.sendMessage({ type: "blocked" }).then(processBlockInfo);
