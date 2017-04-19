/* global $ jQuery: true */
if (!window) { window = global || {}; }

$(function() {
	(function($) {		

		window.KEYBOARD_MAPS = {
			QWERTY: {
				standard: [
					"`1234567890-=".split(''),
					"\tqwertyuiop[]\\".split(''),
					"asdfghjkl;'".split(''),
					"zxcvbnm,./".split('')
				],
				shift: [
					"~!@#$%^&*()_+".split(''),
					"\tQWERTYUIOP{}|".split(''),
					"ASDFGHJKL:\"".split(''),
					"ZXCVBNM<>?".split('')
				]
			}
		};
		
		$.fn.outerHTML = function(s) {
			return s ? this.before(s).remove() : $("<p>").append(this.eq(0).clone()).html();
		};
		
		$.fn.simcockify = function(options) {
			var optDefaults = {
				Exclude: '.no-simcockify', // exclusion selector 
				KeyboardType: window.KEYBOARD_MAPS.QWERTY, // physical keyboard layout
				debug: false, // dribble out activity messages?

				// Velocity factors
				FiveHourEnergies: 0,
				Espressos: 0,
				Coffees: 0,
				
				// Frequency factors
				HoursOfSleep: 8,
				MinutesTalkingToClients: 0,
				DeadlinesLooming: 0,
				EmployeesBlocked: 0,
			};
	
			var opts = $.extend({}, optDefaults, options);
	
			var typoFrequencyFactor = (
				(Math.abs(opts.HoursOfSleep - 8) / 8) +
				(opts.DeadlinesLooming / 20) +
				(opts.EmployeesBlocked / 15) +
				(opts.MinutesTalkingToClients / 1440)
			) / 5;
				
			var typoVelocityFactor = 2 +
				(opts.FiveHourEnergies / 8) +
				(Math.abs(opts.Coffees - 2) / 10) +
				(opts.Espressos / 5);
			
			var config = {
				typosPerWord: typoFrequencyFactor,
				wordSplitRgx: new RegExp(/[\s,;.!?-]/g),
				velocity: 2 + Math.round(Math.max(0, typoVelocityFactor))
			};

			var logMsg = function(msg) {
				if (opts.debug) {
					console.log(msg);
				}
			};
			
			var accessibleKeys = function(intendedCharacter, keyboardMap, velocity) {
				var inMap = false, inRow = false, atCol = false;
			
				mapLoop:
				for (var m in keyboardMap) {
					if (keyboardMap.hasOwnProperty(m)) {
						var map = keyboardMap[m];
						rowLoop:
						for (var r = 0; r < map.length; r++) {
							var row = map[r];
							if (row.indexOf(intendedCharacter) >= 0) {
								inMap = m;
								inRow = r;
								atCol = row.indexOf(intendedCharacter);
								break mapLoop;
							}
						}
					}
				}
				
				if (inMap === false) {
					return [intendedCharacter];
				}
				
				var rowFrom = Math.round(Math.max(0, inRow - (velocity / 2)));
				var rowTo = Math.round(Math.min(keyboardMap[inMap].length - 1, inRow + (velocity / 2)));
				var sets = [];
				for (var rIdx = rowFrom; rIdx < rowTo; rIdx++) {
					sets.push(keyboardMap[inMap][rIdx].slice(Math.max(0, atCol - velocity), 2 * velocity).join(''));
				}
				const allChars = sets.join('').split('');
				return allChars.length > 0 ? allChars : [intendedCharacter];
			}; // accessibleKeys()
			
			var replaceAt = function(str, index, replacement) {
				return str.substr(0, index) + replacement + str.substr(index + replacement.length);
			}; // replaceAt()
	
			var Typos = {
				miskey: {
					probability: 0.1, // 10% chance
					action: function(text) {
						if (/[^\s]/.test(text)) {
							var i1;
							var attemptCnt = 0;
							do {
								i1 = Math.min(text.length - 1, Math.max(0, Math.floor(Math.random() * text.length - 1)));
							} while (/\s/.test(text[i1]) && ++attemptCnt < 10);
							var chr = text[i1];
							var altChrs = accessibleKeys(chr, opts.KeyboardType, config.velocity);
							var altChr = altChrs[Math.floor(Math.random() * altChrs.length)];
							logMsg(`  > Miskey: replacing '${chr}' with '${altChr}' at position ${i1} in "${text}"`);
							return replaceAt(text, i1, altChr);
						}
						return text;
					} // miskey()
				},
				transposition: {
					probability: 0.6, // 60% chance
					action: function(text) {
						if (text.length > 1) {
							var i1 = Math.min(text.length - 1, Math.max(0, Math.floor(Math.random() * text.length - 1)));
							var i2 = Math.min(text.length - 1, Math.max(0, i1 + Math.floor(Math.random() * config.velocity * 2) - config.velocity));
			
							var idx1 = Math.min(i1, i2);
							var idx2 = Math.max(i1, i2);
							if (idx1 != idx2) {
								var char1 = text[idx1];
								var char2 = text[idx2];
								text = replaceAt(text, idx1, char2);
								text = replaceAt(text, idx2, char1);
								logMsg(`  > Transposition: swapping character '${char1}' at ${idx1} and '${char2}' at ${idx2}`);
							}
						}
						return text;
					} // transposition()
				},
				extraCharacter: {
					probability: '*', // take up the slack (impl. 30% chance)
					action: function(text) {
						if (/[^\s]/.test(text)) {
							var i1;
							var attemptCnt = 0;
							do {
								i1 = Math.min(text.length - 1, Math.max(0, Math.floor(Math.random() * text.length - 1)));
							} while (/\s/.test(text[i1]) && ++attemptCnt < 10);
							var chr = text[i1];
							var altChrs = accessibleKeys(chr, opts.KeyboardType, config.velocity);
							var altChr = altChrs[Math.floor(Math.random() * altChrs.length)];
							
							var replacement = (Math.random() < 0.5 ? [chr, altChr] : [altChr, chr]).join('');
							logMsg(`  > extraCharacter: replacing '${chr}' with '${replacement}' at position ${i1}"`);
							return replaceAt(text, i1, replacement);
						}
						return text;
					} // extraCharacter()
				}
			}; // Typos

			var ptm = [];
			logMsg('Building typo probability index...');
			for (var typo in Typos) {
				if (Typos.hasOwnProperty(typo)) {
					var t = Typos[typo];
					t.name = typo;
					ptm.push(t);
				}
			}

			ptm.sort(function(a, b) {
				return a.probability === '*' ? 1 : (
					b.probability === '*' ? -1 : (
						a.probability < b.probability ? -1 : 1
					)
				)
			});
			logMsg('...done');
			var randomTypo = function() {
				var typoSeed = Math.random();
				var typoIdx = -1;
				var cumulative = 0;

				do {
					typoIdx++;
					cumulative += ptm[typoIdx].probability !== '*' ? ptm[typoIdx].probability : 1;
				} while (typoIdx < ptm.length && ptm[typoIdx].probability !== '*' && typoSeed > cumulative)

				return ptm[typoIdx];
			}; // randomTypo()
			
			var getNewContent = function(node) {
				var $node = $(node);
	
				var nodeContent = [];
				var nType = $node.get(0).nodeName;
				if (nType == '#text') {
					var text = node.textContent.trim() || '';
					
					if (text.length > 1) {
						var words = text.split(config.wordSplitRgx);
						var typosNeeded = Math.ceil(words.length * config.typosPerWord);
						var typoCount = 0;
						logMsg(`Analyzing ${words.length} words and generating ${typosNeeded} typos at velocity ${config.velocity}`);
						do {
							var typoFunc = randomTypo().action;
							text = typoFunc(text);
							typoCount++;
						} while (typoCount < typosNeeded);
						logMsg(`Inserted ${typoCount} typos`);
						logMsg('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
					}
					nodeContent.push(text);
				} else {
					var outer = $($node.outerHTML()).html('').outerHTML();
					var tags = outer.split('></');
					nodeContent.push(tags[0] + '>');
					$node.contents().each(function(i, el) {
						if ($(el).is(opts.Exclude)) {
							// @todo support returning nodes without typos
							nodeContent.push(getNewContent(el));
						} else {
							nodeContent.push(getNewContent(el));
						}
						
					});
					nodeContent.push('</' + tags[1]);
				}
				return nodeContent.join(' ');
			};
			var $this = $(this).not(opts.Exclude);
			var cont = getNewContent(this);
			$this.replaceWith(cont);
		};
	}(jQuery));
});