/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const SUPPORT_URL = "https://www.proginosko.com/leechblock/support/";

// Initialize page
//
function initializePage() {
	browser.storage.local.get("sync").then(onGotSync);

	function onGotSync(options) {
		if (options["sync"]) {
			browser.storage.sync.get("theme").then(onGot);
		} else {
			browser.storage.local.get("theme").then(onGot);
		}
	}

	function onGot(options) {
		let theme = options["theme"];
		let link = document.getElementById("themeLink");
		if (link) {
			link.href = "/themes/" + (theme ? `${theme}.css` : "default.css");
		}
	}
}

// Open options page
//
function openOptions() {
	browser.runtime.openOptionsPage();
	window.close();
}

// Open lockdown page
//
function openLockdown() {
	openExtensionPage("lockdown.html");
}

// Open override page
//
function openOverride() {
	openExtensionPage("override.html");
}

// Open stats page
//
function openStats() {
	openExtensionPage("stats.html");
}

// Open extension page (either create new tab or activate existing tab)
//
function openExtensionPage(url) {
	let fullURL = browser.runtime.getURL(url);

	browser.tabs.query({ url: fullURL }).then(onGot, onError);

	function onGot(tabs) {
		if (tabs.length > 0) {
			browser.tabs.update(tabs[0].id, { active: true });
		} else {
			browser.tabs.create({ url: fullURL });
		}
		window.close();
	}

	function onError(error) {
		browser.tabs.create({ url: fullURL });
		window.close();
	}
}

// Cancel override
//
function cancelOverride() {
	let message = {
		type: "override",
		endTime: 0
	};
	browser.runtime.sendMessage(message);

	window.close();
}

// Reset rollover time
//
function resetRollover() {
	let message = {
		type: "reset-rollover",
	};
	browser.runtime.sendMessage(message);

	window.close();
}

// Discard remaining time
//
function discardTime() {
	let message = {
		type: "discard-time",
	};
	browser.runtime.sendMessage(message);

	window.close();
}

// Open online support page
//
function openOnlineSupport() {
	browser.tabs.create({ url: SUPPORT_URL });

	window.close();
}

document.querySelector("#options").addEventListener("click", openOptions);
document.querySelector("#lockdown").addEventListener("click", openLockdown);
document.querySelector("#override").addEventListener("click", openOverride);
document.querySelector("#stats").addEventListener("click", openStats);
document.querySelector("#cancelOverride").addEventListener("click", cancelOverride);
document.querySelector("#resetRollover").addEventListener("click", resetRollover);
document.querySelector("#discardTime").addEventListener("click", discardTime);
document.querySelector("#onlineSupport").addEventListener("click", openOnlineSupport);

document.addEventListener("DOMContentLoaded", initializePage);
