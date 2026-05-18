import { describe, it, expect } from 'vitest';
import { getNotificationRedirect } from '../../utils/navigationHelper';

describe("Navigation", () => {
  it("generates correct redirect URL", () => {
    expect(getNotificationRedirect({ entityType: "HEARING", entityId: 1 })).toBe("/hearings/1");
  });
});
