import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// docs/RBAC-TENANT-RECOMMENDATION.md §11.9/§11.11 -- the real e2e coverage
// flagged there as "still not attempted." Every unit spec in this repo
// fakes PrismaService to sidestep the darwin/linux Prisma engine mismatch
// (see roles.service.spec.ts's own comment); this file deliberately does
// the opposite -- it boots the REAL AppModule against the REAL MySQL
// database over the docker-compose network, and mints REAL HS256 API
// tokens the exact way apps/web's NextAuth `jwt` callback does (see
// apps/web/src/lib/auth.ts: `jwt.sign({ sub, email }, API_JWT_SECRET)`),
// rather than faking anything. It looks users up by their known seeded
// emails rather than hardcoding ids, so it stays correct if the seed data
// is ever reloaded rather than reused as-is.
//
// This can only run inside the `api` container itself, where the compose
// network and `API_JWT_SECRET` both exist: `docker compose exec api npm
// run test:e2e`. It depends on the Slice 1 + advanced-roles seed data
// already being loaded (docker/keycloak/seed-slice1-*.sql, per §11's own
// "to apply" steps) -- if that seed hasn't been run, this suite fails fast
// with a clear message naming the missing user/data rather than a
// confusing assertion failure deep in a test body.

const TEST_USER_EMAILS = {
  superAdmin: 'admin@veroxm.com',
  departmentAdminOnly: 'dept-admin@example.test',
  tenantAdmin: 'dept-editor@example.test',
  plainEditor: 'plain-editor@example.test',
} as const;

type UserKey = keyof typeof TEST_USER_EMAILS;

describe('RBAC surface (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<UserKey, string>;
  let sampleProjectId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwt = app.get(JwtService);
    prisma = app.get(PrismaService);

    for (const key of Object.keys(TEST_USER_EMAILS) as UserKey[]) {
      const email = TEST_USER_EMAILS[key];
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) {
        throw new Error(
          `Seed user missing: ${email} -- run docker/keycloak/seed-slice1-*.sql ` +
            '(see docs/RBAC-TENANT-RECOMMENDATION.md §11\'s "to apply" steps) before this suite',
        );
      }
      tokens[key] = jwt.sign({ sub: user.id, email: user.email });
    }

    // Deliberately "Slice 1 Test Project A" specifically, not just "the
    // first project under Nami Test Department" -- that department also
    // contains "ds" and "Slice 1 Test Project B", and plainEditor's direct
    // editor{id} role is on THIS project specifically (per the established
    // test-user roster in docs/RBAC-TENANT-RECOMMENDATION.md §11). Picking
    // any other project in the department would silently change what the
    // Editor-bundle assertion below is actually proving.
    const project = await prisma.project.findFirst({
      where: { name: 'Slice 1 Test Project A' },
    });
    if (!project) {
      throw new Error(
        'Seed data missing: "Slice 1 Test Project A" -- run the Slice 1 seed scripts before this suite',
      );
    }
    sampleProjectId = project.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function bearer(key: UserKey): string {
    return `Bearer ${tokens[key]}`;
  }

  describe('authentication', () => {
    it('rejects a request with no bearer token', () => {
      return request(app.getHttpServer()).get('/tenants').expect(401);
    });

    it('rejects a request with a garbage token', () => {
      return request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });
  });

  describe('GET /tenants', () => {
    it('Super Admin sees every Tenant, including the real VeroXM one', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', bearer('superAdmin'))
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((t: { name: string }) => t.name === 'VeroXM')).toBe(true);
    });

    it('a Department-Admin-only user (no Tenant Admin grant of their own) sees an empty list', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', bearer('departmentAdminOnly'))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('a genuine Tenant Admin sees the Tenant they administer', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', bearer('tenantAdmin'))
        .expect(200);
      expect(res.body.some((t: { name: string }) => t.name === 'VeroXM')).toBe(true);
    });

    it('a user with no elevated access at all sees an empty list', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', bearer('plainEditor'))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /departments', () => {
    it('a Department Admin sees their own Department', async () => {
      const res = await request(app.getHttpServer())
        .get('/departments')
        .set('Authorization', bearer('departmentAdminOnly'))
        .expect(200);
      expect(res.body.some((d: { name: string }) => d.name === 'Nami Test Department')).toBe(true);
    });

    it('a user with no Department/Tenant scope at all sees an empty list', async () => {
      const res = await request(app.getHttpServer())
        .get('/departments')
        .set('Authorization', bearer('plainEditor'))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /permissions/my-permissions/:projectId', () => {
    // dept-admin now also holds department_admin1 (§11's advanced-roles
    // seed), so this bundle may come back as Department Admin's superset
    // of Admin rather than plain Admin -- either way it must contain
    // content:approve, which is the actual thing worth proving here: this
    // user can approve content on this project, one way or another.
    it('returns a bundle including content:approve for a user with an Admin-or-above grant on the project', async () => {
      const res = await request(app.getHttpServer())
        .get(`/permissions/my-permissions/${sampleProjectId}`)
        .set('Authorization', bearer('departmentAdminOnly'))
        .expect(200);
      expect(res.body.permissions).toEqual(
        expect.arrayContaining(['content:read', 'content:write', 'content:approve', 'content:publish']),
      );
    });

    // First run of this suite against the real stack found plainEditor
    // also holds a "Content Approver" custom role (content:read +
    // content:approve only) scoped to Nami Test Department -- a leftover,
    // correct grant from this engagement's own §5.6/custom-roles testing,
    // not a bug: §5.7 explicitly designs for one user holding multiple
    // roles across scopes at once, and a custom role granting
    // content:approve to a non-admin is exactly what §5.6 built custom
    // roles to do. That means content:approve is now a legitimately
    // present permission for this user on this project, so it is NOT a
    // safe signal to assert absent here -- asserting it was this suite's
    // own mistake on first write, not a code defect, and it's corrected
    // below rather than left in as a flaky assertion against real,
    // changeable seed state. members:manage/workflow:configure/
    // roles:configure are the genuinely reliable signal: they're
    // Admin/Department Admin/Tenant Admin exclusives that this specific
    // custom role doesn't grant, so their absence is what actually proves
    // this user isn't some tier of Admin, regardless of what narrower
    // custom roles get layered on top later.
    it('returns a bundle with no Admin-tier permission for a user holding only editor{projectId} plus a narrow custom role', async () => {
      const res = await request(app.getHttpServer())
        .get(`/permissions/my-permissions/${sampleProjectId}`)
        .set('Authorization', bearer('plainEditor'))
        .expect(200);
      expect(res.body.permissions).toEqual(expect.arrayContaining(['content:read', 'content:write']));
      expect(res.body.permissions).not.toContain('members:manage');
      expect(res.body.permissions).not.toContain('workflow:configure');
      expect(res.body.permissions).not.toContain('roles:configure');
    });
  });
});
