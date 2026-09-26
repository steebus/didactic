import { describe, it, expect } from 'vitest'
import {
  layBed,
  seedBed,
  unevenness,
  DEFAULT_FORCES,
  SPACING,
  type BedLink,
  type BedNode,
  type Forces,
} from '../src/forces'

const OFF: Forces = { spacing: 1, gravity: 1, linkPull: 0, subjectPull: 0, kinshipPull: 0 }

/** A bed with some shape to it: five subjects, thirty loose topics and
 *  two hundred stated relations thrown across all of them. Seeded, so
 *  every run is the same bed. */
function bed(n = 150, subjects = 5, loose = 30, edges = 200) {
  let s = 7
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
  const nodes: BedNode[] = []
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `t${i}`,
      radius: 5 + rnd() * 12,
      subjects: i < loose ? [] : [`s${i % subjects}`],
      satellite: false,
    })
  }
  const stated: BedLink[] = []
  for (let i = 0; i < edges; i++) {
    const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n)
    if (a !== b) stated.push({ source: `t${a}`, target: `t${b}`, weight: rnd() })
  }
  return { nodes, stated }
}

function settled(forces: Forces, shape = bed(), kinship: BedLink[] = []) {
  seedBed(shape.nodes, n => n.subjects[0] ?? 'loose')
  const layout = layBed(shape.nodes, { stated: shape.stated, attach: [], kinship }, forces, false)
  layout.settle()
  return shape.nodes
}

/** Mean distance from each member of a group to the group's centre,
 *  as a share of the whole bed's radius. */
function spread(nodes: BedNode[], inGroup: (n: BedNode) => boolean) {
  const members = nodes.filter(inGroup)
  const cx = members.reduce((a, n) => a + n.x!, 0) / members.length
  const cy = members.reduce((a, n) => a + n.y!, 0) / members.length
  const mean = members.reduce((a, n) => a + Math.hypot(n.x! - cx, n.y! - cy), 0) / members.length
  const radius = Math.max(...nodes.map(n => Math.hypot(n.x!, n.y!)))
  return mean / radius
}

describe('the bed with every pull turned off', () => {
  it('settles as an evenly spaced disc', () => {
    // Points thrown at random score about 0.52 on this measure and a
    // perfect lattice 0. ForceAtlas2's constant-magnitude gravity put a
    // dense knot in the middle of this same bed.
    expect(unevenness(settled(OFF))).toBeLessThan(0.1)
  })

  it('stays even with gravity off too, only larger', () => {
    const drawn = settled(OFF)
    const loose = settled({ ...OFF, gravity: 0 })
    expect(unevenness(loose)).toBeLessThan(0.1)
    const reach = (ns: BedNode[]) => Math.max(...ns.map(n => Math.hypot(n.x!, n.y!)))
    expect(reach(loose)).toBeGreaterThan(reach(drawn))
  })

  it('spaces seeds at about SPACING', () => {
    // The disc a charge-and-spring bed settles into has a known size.
    const nodes = settled(OFF)
    const reach = Math.max(...nodes.map(n => Math.hypot(n.x!, n.y!)))
    const expected = SPACING * Math.sqrt(nodes.length / Math.PI)
    expect(reach).toBeGreaterThan(expected * 0.8)
    expect(reach).toBeLessThan(expected * 1.2)
  })
})

describe('link pull', () => {
  it('at nothing is no force at all', () => {
    // It set ForceAtlas2's edgeWeightInfluence, which at 0 means every
    // edge at full strength -- and no edge carried a weight, so the
    // slider moved nothing at any value.
    const withLinks = settled(OFF)
    const without = settled(OFF, { ...bed(), stated: [] })
    withLinks.forEach((n, i) => {
      expect(n.x).toBeCloseTo(without[i].x!, 6)
      expect(n.y).toBeCloseTo(without[i].y!, 6)
    })
  })

  it('draws joined topics closer when it is turned up', () => {
    const gap = (nodes: BedNode[], links: BedLink[]) => {
      const at = new Map(nodes.map(n => [n.id, n]))
      const ds = links.map(l => {
        const a = at.get(String(typeof l.source === 'object' ? l.source.id : l.source))!
        const b = at.get(String(typeof l.target === 'object' ? l.target.id : l.target))!
        return Math.hypot(a.x! - b.x!, a.y! - b.y!)
      })
      return ds.reduce((x, y) => x + y, 0) / ds.length
    }
    const off = bed()
    const on = bed()
    settled(OFF, off)
    settled({ ...OFF, linkPull: 2 }, on)
    expect(gap(on.nodes, on.stated)).toBeLessThan(gap(off.nodes, off.stated))
  })
})

describe('subject pull', () => {
  it('gathers a subject into its own bed', () => {
    const off = settled(OFF)
    const on = settled({ ...OFF, subjectPull: 1 })
    const inS0 = (n: BedNode) => n.subjects.includes('s0')
    expect(spread(on, inS0)).toBeLessThan(spread(off, inS0) * 0.8)
  })

  it('never gathers the loose topics, which share no subject', () => {
    // The ring through the membership edges threaded every loose topic
    // onto one ring of its own, and the topics filed nowhere drew as
    // one cluster: the very topics a new subject would sprout from,
    // gathered by the layout rather than by anything they share.
    const shape = () => {
      const b = bed()
      return { ...b, nodes: b.nodes.map(n => ({ ...n, subjects: [] })) }
    }
    const off = settled(OFF, shape())
    const on = settled({ ...OFF, subjectPull: 3 }, shape())
    on.forEach((n, i) => expect(n.x).toBeCloseTo(off[i].x!, 6))
  })
})

describe('kinship pull', () => {
  it('gathers topics the kinship joins, across their subjects', () => {
    // Ten topics from five different subjects, joined only by kinship.
    const kin: BedLink[] = []
    const members = Array.from({ length: 10 }, (_, i) => `t${40 + i * 7}`)
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        kin.push({ source: members[i], target: members[j], weight: 1 })
      }
    }
    const inKin = (n: BedNode) => members.includes(n.id)
    const off = settled({ ...OFF, kinshipPull: 0 }, bed(), kin)
    const on = settled({ ...OFF, kinshipPull: 1 }, bed(), kin)
    expect(spread(on, inKin)).toBeLessThan(spread(off, inKin) * 0.6)
  })
})

describe('seedBed', () => {
  it('lays the same bed out the same way every time', () => {
    const a = bed(), b = bed()
    seedBed(a.nodes, n => n.subjects[0] ?? 'loose')
    seedBed(b.nodes, n => n.subjects[0] ?? 'loose')
    a.nodes.forEach((n, i) => {
      expect(n.x).toBe(b.nodes[i].x)
      expect(n.y).toBe(b.nodes[i].y)
    })
  })

  it('starts even, so the first frame already looks like the rest', () => {
    const { nodes } = bed()
    seedBed(nodes, n => n.subjects[0] ?? 'loose')
    expect(unevenness(nodes)).toBeLessThan(0.2)
  })

  it('starts a satellite beside what it hangs off', () => {
    const nodes: BedNode[] = [
      { id: 'a', radius: 8, subjects: [], satellite: false },
      { id: 'b', radius: 8, subjects: [], satellite: false },
      { id: 'r', radius: 4, subjects: [], satellite: true },
    ]
    seedBed(nodes, () => 'loose', n => (n.id === 'r' ? 'b' : null))
    const [, b, r] = nodes
    expect(Math.hypot(r.x! - b.x!, r.y! - b.y!)).toBeLessThan(SPACING)
  })
})

describe('configure', () => {
  it('warms the bed again, so a slider moves it', () => {
    const { nodes, stated } = bed(40)
    seedBed(nodes, () => 'loose')
    const layout = layBed(nodes, { stated, attach: [] }, DEFAULT_FORCES, false)
    layout.settle()
    expect(layout.simulation.alpha()).toBeLessThan(0.01)
    layout.configure({ ...DEFAULT_FORCES, linkPull: 2 })
    expect(layout.simulation.alpha()).toBeGreaterThan(0.4)
  })
})
