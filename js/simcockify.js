if (!window) { window = global || {}; }

$(function() {
	(function($) {		
		console.clear();
		
		// Just dump it in the global namespace, like a boss
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
			return s ? this.before(s).remove() : jQuery("<p>").append(this.eq(0).clone()).html();
		};
		
		$.fn.simcockify = function(options) {
			var optDefaults = {
				debug: false,
				// Velocity factors
				FiveHourEnergies: 1,
				Espressos: 0,
				Coffees: 3,
				// Frequency factors
				HoursOfSleep: 5,
				MinutesTalkingToClients: 90,
				DeadlinesLooming: 2,
				EmployeesBlocked: 1,
				Exclude: '.no-simcockify',
				KeyboardType: window.KEYBOARD_MAPS.QWERTY,
			};
	
			var opts = $.extend({}, optDefaults, options);
			console.log(opts);
	
			var typoFrequencyFactor = 0 +
				(((24 - opts.HoursOfSleep) / 24) / 2) +
				(opts.DeadlinesLooming / 20) +
				(opts.EmployeesBlocked / 15) +
				(opts.MinutesTalkingToClients / 1440);
				
			var typoVelocityFactor = 2 +
				(opts.FiveHourEnergies / 8) +
				(opts.Coffees / 10) +
				(opts.Espressos / 5);
			
			var config = {
				typosPerWord: Math.max(0.1, typoFrequencyFactor),
				wordSplitRgx: new RegExp(/[\s,;.-]/g),
				velocity: 2 + Math.round(Math.max(0, typoVelocityFactor))
			};
			
			console.log(config);
			
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
				
				var rowFrom = Math.round(Math.max(0, inRow - (velocity / 1.5)));
				var rowTo = Math.min(keyboardMap[inMap].length - 1, inRow + (velocity / 1.5));
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
				transposition: {
					probabiliy: 0.6,
					action: function(text) {
						if (text.length > 1) {
							var typoCount = 0;
							var i1 = Math.min(text.length - 1, Math.max(0, Math.floor(Math.random() * text.length - 1)));
							var i2 = Math.min(text.length - 1, Math.max(0, i1 + Math.floor(Math.random() * config.velocity * 2) - config.velocity));
			
							var idx1 = Math.min(i1, i2);
							var idx2 = Math.max(i1, i2);
							if (idx1 != idx2) {
								var char1 = text[idx1];
								var char2 = text[idx2];
								text = replaceAt(text, idx1, char2);
								text = replaceAt(text, idx2, char1);
								typoCount++;
								logMsg (`  > Transposition: swapping character '${char1}' at ${idx1} and '${char2}' at ${idx2}`);
							}
						}
						return text;
					} // transposition()
				},
				miskey: {
					probability: 0.3,
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
				extraCharacter: {
					probability: '*',
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
							logMsg(`  > extraCharacter: replacing '${chr}' with '${replacement}' at position ${i1} in "${text}"`);
							return replaceAt(text, i1, replacement);
						}
						return text;
					} // extraCharacter()
				}
			}; // Typos
			
			var typesOfTypos = Object.keys(Typos);
			
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
						
						do {
							var doWhat = typesOfTypos[Math.floor(Math.random() * typesOfTypos.length)];
							var typoFunc = Typos[doWhat].action;
							//logMsg(`Doing a '${doWhat}' typo on "${text}":`);
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
						nodeContent.push(getNewContent(el));
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