# Simcockify

A jQuery plugin to make your copy all Simcocked up.

## Basic Usage
```javascript

// Optional, but allows for repeatability...
$.seedPRNG('repeatable-seed-abc-123');

$('.body-copy').simcockify({
	// Velocity factors
	FiveHourEnergies: 0,
	Espressos: 0,
	Coffees: 2,
	
	// Frequency factors
	HoursOfSleep: 8,
	MinutesTalkingToClients: 90,
	DeadlinesLooming: 2,
	EmployeesBlocked: 1,

	debug: true,
	seed: 'repeatable-seed-zy1231'
});
```

## Sandbox

Try out [Simcockify here](https://theraccoonbear.github.io/Simcockify/sample.html)

## Write up

A [little background](https://earthlinginteractive.com/blog/item/simcockify-a-typo-generator-plugin) on the impetus for the plugin and the overwrought design.