// The hubs of the Navigation track (G.8, G.9, G.5). Pure modules of the game layer; later tasks add the company and
// wealth hubs here. A hub never imports menus.ts, manage.ts, business.ts, career.ts or assets.ts (import cycles).
export * from './cockpit'
export * from './company'
export * from './keywords'
export * from './needs'
export * from './people'
export * from './sections'
export * from './series-adapter'
export * from './wealth'
