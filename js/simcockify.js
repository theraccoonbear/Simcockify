$(function() {
	(function($) {
		console.clear();
		
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
			var accessibleKeys = function(intendedCharacter, keyboardMap, range) {
				var inMap = false, inRow = false, atCol = false;
			
				mapLoop:
				for (var m in keyboardMap) {
					if (keyboardMap.hasOwnProperty(m)) {
						console.log(`searching ${m}`);
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
				
				var rowFrom = Math.max(0, inRow - velocity);
				var rowTo = Math.min(keyboardMap[inMap].length - 1, inRow + velocity);
				var sets = [];
				for (var rIdx = rowFrom; rIdx < rowTo; rIdx++) {
					sets.push(keyboardMap[inMap][inRow].slice(Math.max(0, atCol - velocity), 2 * velocity).join());
				}
				return sets.join('').split('');
			}; // accessibleKeys()
			
			var replaceAt = function(str, index, replacement) {
				return str.substr(0, index) + replacement + str.substr(index + replacement.length);
			};
	
			var Typos = {
				transposition: function(text) {
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
						}
					}
					return text;
				}, // transposition()
				miskey: function(text) {
					if (/[^\s]/.test(text)) {
						return text;
					}
					return text;
				}, // miskey()
				missingSpace: function(text) {
					if (!/\s/.test(text)) {
						return text;
					}
					var newText = text;
					do {
						var offset = Math.floor(Math.random() * text.length);
						var rgx = new RegExp("^(.{" + offset + ",})\\s");
						newText = text.replace(rgx, '$1');
					} while (newText == text);
					
					return newText;
				} // missingSpace()
			}; // Typos
			
			var typesOfTypos = Object.keys(Typos);
			
			var optDefaults = {
				FiveHourEnergies: 1,
				Espressos: 0,
				Coffees: 3,
				MinutesTalkingToClients: 90,
				DeadlinesLooming: 2,
				HoursOfSleep: 5,
				EmployeesBlocked: 1,
				KeyboardType: window.KEYBOARD_MAPS.QWERTY
			};
	
			var opts = $.extend({}, optDefaults, options);
	
			var config = {
				typosPerWord: Math.min(0.1, 0.1),
				wordSplitRgx: new RegExp(/[\s,;.-]/g),
				velocity: 2 + Math.min(0, (opts.FiveHourEnergies / 3) + (opts.Coffees / 5) + (opts.Espressos / 2))
			};
	
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
							var typoFunc = Typos[doWhat];
							console.log(`Doing a ${doWhat} typo on`, text);
							text = typoFunc(text);
							typoCount++;
						} while (typoCount < typosNeeded);
						console.log(`Inserted ${typoCount} typos`);
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
			var $this = $(this);
			var cont = getNewContent(this);
			$this.replaceWith(cont);
		};
	}(jQuery));
});