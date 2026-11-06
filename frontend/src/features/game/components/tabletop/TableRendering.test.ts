import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import { shadowCasterSignature } from './TableRendering';

function table() {
  const scene = new Scene();
  const piece = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  piece.castShadow = true;
  const print = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const holder = new Group();
  holder.add(piece);
  scene.add(holder, print);
  scene.updateMatrixWorld();
  return { scene, piece, print, holder };
}

const sign = (scene: Scene) => [...shadowCasterSignature(scene, [])];

describe('shadow redraw check', () => {
  it('changes when a shadow caster moves, appears or is hidden', () => {
    const { scene, piece, holder } = table();
    const start = sign(scene);
    holder.position.x = 1;
    scene.updateMatrixWorld();
    const moved = sign(scene);
    expect(moved).not.toEqual(start);

    const card = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    card.castShadow = true;
    scene.add(card);
    scene.updateMatrixWorld();
    expect(sign(scene)).not.toEqual(moved);

    piece.visible = false;
    expect(sign(scene).length).toBeLessThan(moved.length + 17);
  });

  it('stays the same when only things that cast no shadow change', () => {
    const { scene, print } = table();
    const start = sign(scene);
    print.position.set(3, 2, 1);
    scene.updateMatrixWorld();
    expect(sign(scene)).toEqual(start);
  });
});
