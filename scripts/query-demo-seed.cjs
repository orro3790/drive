require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function printSection(title, rows) {
	console.log(`\n=== ${title} ===`);
	for (const row of rows) {
		console.log(row);
	}
}

async function main() {
	const owners = await sql`
    select o.slug, o.owner_user_id, u.email, u.role
    from organizations o
    left join "user" u on u.id = o.owner_user_id
    where o.slug in ('seed-org-a', 'seed-org-b')
    order by o.slug
  `;

	await printSection(
		'ORG OWNERS',
		owners.map((row) => `${row.slug} | owner=${row.email ?? 'missing'} | role=${row.role ?? 'n/a'}`)
	);

	const roster = await sql`
    select u.email, u.is_flagged, dhs.assignment_pool_eligible, dhs.requires_manager_intervention,
           dhs.stars, dhs.current_score
    from "user" u
    left join driver_health_state dhs on dhs.user_id = u.id
    where u.organization_id = (select id from organizations where slug = 'seed-org-a')
      and u.role = 'driver'
    order by u.email
  `;

	await printSection(
		'ORG A DRIVER ROSTER',
		roster.map(
			(row) =>
				`${row.email} | flagged=${row.is_flagged} | pool=${row.assignment_pool_eligible} | intervention=${row.requires_manager_intervention} | stars=${row.stars} | score=${row.current_score}`
		)
	);

	const notifications = await sql`
    select u.email, count(*) as notification_count
    from notifications n
    join "user" u on u.id = n.user_id
    where n.organization_id = (select id from organizations where slug = 'seed-org-a')
    group by u.email
    order by notification_count desc, u.email
  `;

	await printSection(
		'ORG A NOTIFICATION COUNTS',
		notifications.map((row) => `${row.email} | notifications=${row.notification_count}`)
	);

	const managerRoutes = await sql`
    select mu.email as manager_email, count(*) as route_count
    from routes r
    join warehouses w on w.id = r.warehouse_id
    left join "user" mu on mu.id = r.manager_id
    where w.organization_id = (select id from organizations where slug = 'seed-org-a')
    group by mu.email
    order by route_count desc, mu.email
  `;

	await printSection(
		'ORG A MANAGER ROUTE OWNERSHIP',
		managerRoutes.map((row) => `${row.manager_email} | routes=${row.route_count}`)
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
