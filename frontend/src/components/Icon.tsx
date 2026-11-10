const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    tasks: 'M9 5h12 M9 12h12 M9 19h12 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2',
    calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
    habits: 'M4 13l5 5L20 6', focus: 'M9 2h6 M12 6v6l3 2 M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    stats: 'M4 20V10 M12 20V4 M20 20v-7', search: 'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14 M15 15l6 6',
    bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4', export: 'M12 3v12 M8 11l4 4 4-4 M4 16v5h16v-5',
    arrow: 'M5 12h14 M14 7l5 5-5 5', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
    plus: 'M12 5v14 M5 12h14', logout: 'M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4',
    leaf: 'M5 19c-7-13 8-15 15-15 0 8-1 22-15 15z M5 19L16 8',
    play: 'M8 4l13 8-13 8z', pause: 'M8 4v16 M16 4v16', reset: 'M4 9a8 8 0 1 1 0 6 M4 3v6h6',
    edit: 'M4 16L16 4l4 4L8 20H4z M13 7l4 4', trash: 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
};
export function Icon({ name, size = 20 }: {
    name: string;
    size?: number;
}) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.leaf}/></svg>;
}
