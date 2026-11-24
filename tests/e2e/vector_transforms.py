"""Rigid edits carry atom vectors, and Edit history restores their exact bits."""

import json
import math

from premerge import ROOT, load
from step3b_product_apis import check, check_vector_history_path, vector_history_command, vector_history_snapshot

TOLERANCE = 1e-9
METAL_VECTORS = '''5
VibeMolVectors=[{"name":"ligand vectors","color":"#44AAFF","scale":1}]
Ni  0     0     0   0.2  0.3  0.4
Cl  2.05  0     0   0.4  0.3  0.2
Cl  0     2.05  0   0.1  0.6 -0.4
Cl -2.05  0     0   0.3 -0.2  0.7
Cl  0    -2.05  0  -0.6  0.1  0.3
'''


def volume(page):
    return page.evaluate("async () => (await VibeMolSession.export()).sources[0].volume")


def vector_bits(page):
    return page.evaluate("""() => {
      const vectors = __vmEditVectorProbe().xyzVectors;
      const bits = new DataView(new ArrayBuffer(8));
      const encode = value => {
        bits.setFloat64(0, value);
        return bits.getBigUint64(0).toString(16).padStart(16, '0');
      };
      return Object.fromEntries(Object.entries(vectors.byAtomId).map(
        ([id, row]) => [id, row.map(vector => vector.map(encode))]
      ));
    }""")


def angles(vol, rigid_ids):
    atoms = {atom['id']: atom for atom in vol['atoms']}
    vectors = vol['xyzVectors']['byAtomId']
    records = {}
    for bond in vol['bonds']:
        if bond['kind'] == 'blocked':
            continue
        for source, target in ((bond['a'], bond['b']), (bond['b'], bond['a'])):
            if source not in rigid_ids or target not in rigid_ids:
                continue
            x, y, z = (atoms[target][axis] - atoms[source][axis] for axis in 'xyz')
            for index, (u, v, w) in enumerate(vectors.get(source, [])):
                if math.hypot(u, v, w) == 0:
                    continue
                cross = math.hypot(y*w-z*v, z*u-x*w, x*v-y*u)
                records[(source, target, index)] = math.atan2(cross, x*u+y*v+z*w)
    return records


def compare_angles(before, after, rigid_ids, action):
    expected = angles(before, rigid_ids)
    actual = angles(after, rigid_ids)
    assert expected and expected.keys() == actual.keys(), (expected, actual)
    records = [{'atom': key[0], 'bondTo': key[1], 'setIndex': key[2],
                'actual': current, 'expected': expected[key], 'absDifference': abs(current - expected[key])}
               for key, current in actual.items()]
    print('[vector-bond-angles] ' + json.dumps({
        'action': action, 'count': len(records), 'tolerance': TOLERANCE,
        'maxError': max(row['absDifference'] for row in records), 'comparisons': records,
    }), flush=True)
    assert all(row['absDifference'] <= TOLERANCE for row in records), action


def compare_ligand_vectors(before, after):
    def direction(atom, center):
        delta = [atom[axis] - center[axis] for axis in 'xyz']
        length = math.hypot(*delta)
        assert length > 0, (atom, center)
        return [value / length for value in delta]

    def cross(left, right):
        a, b, c = left
        x, y, z = right
        return [b*z-c*y, c*x-a*z, a*y-b*x]

    before_atoms, after_atoms = before['atoms'], after['atoms']
    center = before_atoms[0]
    assert center == after_atoms[0] and center['Z'] == 28, (center, after_atoms[0])
    before_vectors = before['xyzVectors']['byAtomId']
    after_vectors = after['xyzVectors']['byAtomId']
    assert before_vectors[center['id']] == after_vectors[center['id']], center
    records = []
    for original, applied in zip(before_atoms[1:], after_atoms[1:], strict=True):
        atom_id = original['id']
        assert applied['id'] == atom_id, (original, applied)
        start, end = direction(original, center), direction(applied, center)
        turn = cross(start, end)
        cosine = math.fsum(a*b for a, b in zip(start, end, strict=True))
        assert cosine > -1 + TOLERANCE, (start, end)
        vector, = before_vectors[atom_id]
        actual, = after_vectors[atom_id]
        # Rodrigues' shortest rotation, derived from the observed ligand directions.
        first = cross(turn, vector)
        second = cross(turn, first)
        expected = [v + a + b / (1 + cosine) for v, a, b in zip(vector, first, second, strict=True)]
        records.append({'atom': atom_id, 'actual': actual, 'expected': expected,
                        'maxError': max(abs(a-b) for a, b in zip(actual, expected, strict=True)),
                        'componentChange': max(abs(a-b) for a, b in zip(actual, vector, strict=True))})
    print('[coordination-vector-rotation] ' + json.dumps({'ligands': records, 'tolerance': TOLERANCE}), flush=True)
    assert len(records) == 4 and all(row['maxError'] <= TOLERANCE for row in records), records
    assert any(row['componentChange'] > 0.1 for row in records), records


def vectors_follow_rigid_edits(page):
    source = (ROOT / 'assets/app/js/app.js').read_text()
    marker = 'window.VibeMolTesting = Object.freeze({'
    assert source.count(marker) == 1
    script = """
      // Drive the same Edit drag controller as the native pointer handlers.
      window.__vmTestVectorRotate = (indices, keepDragging = false) => {
        const original = { clientX: 650, clientY: 450 };
        const target = { clientX: 687, clientY: 422 };
        const started = editTransformController.startRotateDrag(original, indices, { axis: 'none' });
        if (!started) return { started };
        const updated = editTransformController.updateRotateDrag(target);
        if (keepDragging) return { started, updated };
        const finished = editTransformController.finishRotateDrag();
        return { started, updated, finished };
      };
      window.__vmTestCancelVectorRotate = () => editTransformController.cancelRotateDrag();
      window.__vmTestBondVectorRotate = ({ index, anchor }) => {
        const vol = volumes[currentIndex].vol;
        const original = { clientX: 650, clientY: 450 };
        const started = beginTransformDragFromResolvedTarget(original, vol,
          { indices: [index], kind: 'fragment' }, null,
          { type: 'bond', selectedAtomIndex: index, anchorAtomIndex: anchor, bondIndices: [index, anchor] },
          { dragMode: 'bondAngleHorizontal' });
        if (!started) return { started };
        updateTransformDragFromEvent({ clientX: 690, clientY: 450 });
        const moved = transformMoved;
        finalizeTransformDrag();
        return { started, moved };
      };
      window.__vmEditVectorProbe = () => volumes[currentIndex].vol;
    """
    page.route('**/assets/app/js/app.js*',
               lambda route: route.fulfill(body=source.replace(marker, script + marker),
                                           content_type='text/javascript'))
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('() => window.VibeMolEmbed && window.VibeMolEdit && window.__vmEditVectorProbe')
    path = ROOT / 'examples/xyz-vectors.xyz'

    def load_fixture(name=path.name, text=None):
        result = load(page, [{'name': name, 'text': text if text is not None else path.read_text()}])
        assert result['ok'] and result['loadedCount'] == 1, result
        edit = page.evaluate("() => VibeMolEdit.enter({tool:'transform'})")
        assert edit['ok'], edit
        return volume(page)

    def check_undo_redo(original, rotated, *, perturb_vectors=False, states=(None, None)):
        for key, expected, state in zip(('ControlOrMeta+z', 'ControlOrMeta+Shift+z'),
                                        (original, rotated), states, strict=True):
            if perturb_vectors:
                page.evaluate('''() => {
                    const vol = __vmEditVectorProbe();
                    vol.xyzVectors.byAtomId[vol.atoms[0].id][0][0] = -0;
                }''')
                assert vector_bits(page) != expected, 'Undo probe must alter the live vector bits'
            page.keyboard.press(key)
            actual = vector_bits(page)
            print('[vector-history] ' + json.dumps({'action': key, 'actual': actual, 'expected': expected}), flush=True)
            assert actual == expected, (actual, expected)
            if state is not None:
                restored = volume(page)
                for field in ('atoms', 'annotations'):
                    assert restored[field] == state[field], (key, field, restored[field], state[field])

    before = load_fixture()
    original = vector_bits(page)
    page.keyboard.press('p')
    after = volume(page)
    assert after['atoms'] != before['atoms'], 'Align principal axes must change atom positions'
    compare_angles(before, after, {atom['id'] for atom in before['atoms']}, 'Align principal axes')
    aligned = vector_bits(page)
    assert aligned != original
    check_undo_redo(original, aligned)

    for selection in ('all', 'partial'):
        before = load_fixture()
        indices = list(range(len(before['atoms']))) if selection == 'all' else [0, 1, 2]
        atom_ids = {before['atoms'][index]['id'] for index in indices}
        result = page.evaluate('indices => VibeMolTesting.setEditSelectionIndices(indices)', indices)
        assert result, result
        assert page.evaluate('() => VibeMolTesting.getEditSelectionIndices()') == indices
        original = vector_bits(page)
        moved = page.evaluate('indices => __vmTestVectorRotate(indices)', indices)
        assert moved == {'started': True, 'updated': True, 'finished': True}, moved
        after = volume(page)
        assert after['atoms'] != before['atoms'], ('Edit rotation', selection)
        compare_angles(before, after, atom_ids, f'Edit rotate {selection}')
        rotated = vector_bits(page)
        assert all(rotated[atom_id] == values for atom_id, values in original.items() if atom_id not in atom_ids)
        assert any(rotated[atom_id] != original[atom_id] for atom_id in atom_ids)
        check_undo_redo(original, rotated)

    before = load_fixture()
    unaligned = vector_history_snapshot(page)
    page.locator('#canvas').focus()
    page.keyboard.press('p')
    aligned = vector_history_snapshot(page)
    check('First rotation changes coordinates', aligned['atoms'] != unaligned['atoms'], True)
    vector_history_command(page, 'setArrow', {'name':'between', 'color':'#AA2288', 'vector':[0,1,0], 'scale':1})
    with_arrow = vector_history_snapshot(page)
    check('The intervening command preserves aligned atoms', with_arrow['atoms'], aligned['atoms'])
    indices = list(range(len(before['atoms'])))
    check('Select atoms for the second rotation', page.evaluate(
        'indices => VibeMolTesting.setEditSelectionIndices(indices)', indices), True)
    check('Apply second native rotation', page.evaluate('indices => __vmTestVectorRotate(indices)', indices),
          {'started':True, 'updated':True, 'finished':True})
    rotated = vector_history_snapshot(page)
    check('Second rotation changes the new arrow and atoms', [
        rotated['vectors']['arrows'] != with_arrow['vectors']['arrows'], rotated['atoms'] != with_arrow['atoms'],
    ], [True, True])
    check_vector_history_path(page, [(unaligned,None),(aligned,'Align principal axes'),(with_arrow,'Vectors'),
                                     (rotated,f'Rotate {len(indices)} atoms')])

    before = load_fixture()
    original = vector_history_snapshot(page)
    vector_history_command(page, 'setArrow', {
        'name': 'drag arrow', 'color': '#AA2288', 'anchor': 'point',
        'origin': [1, 2, 3], 'vector': [0, 1, 0], 'scale': 1,
    })
    before_drag = vector_history_snapshot(page)
    before_bits = vector_bits(page)
    indices = list(range(len(before['atoms'])))
    check('Select atoms for cancelled drag', page.evaluate(
        'indices => VibeMolTesting.setEditSelectionIndices(indices)', indices), True)
    check('Rotate without releasing the drag', page.evaluate(
        'indices => __vmTestVectorRotate(indices, true)', indices), {'started': True, 'updated': True})
    during_drag = vector_history_snapshot(page)
    print('[vector-cancel] ' + json.dumps({'before': before_drag, 'during': during_drag}), flush=True)
    check('Active drag changes coordinates, atom vectors and free arrows', [
        during_drag['atoms'] != before_drag['atoms'],
        during_drag['vectors']['xyzVectors'] != before_drag['vectors']['xyzVectors'],
        during_drag['vectors']['arrows'] != before_drag['vectors']['arrows'],
    ], [True, True, True])
    check('Cancel an active Edit drag', page.evaluate('() => __vmTestCancelVectorRotate()'), True)
    check('Cancel restores the complete pre-drag state', vector_history_snapshot(page), before_drag)
    check('Cancel restores vector component bits', vector_bits(page), before_bits)
    check_vector_history_path(page, [(original, None), (before_drag, 'Vectors')])

    before = load_fixture()
    original = vector_bits(page)
    sulfur, carbon = before['atoms'][7]['id'], before['atoms'][3]['id']
    assert any({bond['a'], bond['b']} == {sulfur, carbon} for bond in before['bonds']), before['bonds']
    drag = page.evaluate('args => __vmTestBondVectorRotate(args)', {'index': 7, 'anchor': 3})
    assert drag == {'started': True, 'moved': True}, drag
    after = volume(page)
    compare_angles(before, after, {sulfur, carbon}, 'Rotate terminal atom about its bond')
    rotated = vector_bits(page)
    assert rotated[sulfur] != original[sulfur]
    assert all(rotated[atom_id] == values for atom_id, values in original.items() if atom_id != sulfur)
    check_undo_redo(original, rotated)

    for label in ('UI move', 'VibeMolEdit.translate'):
        before = load_fixture()
        original = vector_bits(page)
        if label == 'UI move':
            indices = list(range(len(before['atoms'])))
            assert page.evaluate('indices => VibeMolTesting.setEditSelectionIndices(indices)', indices)
            position = page.locator('#editSelectionPosition input[data-selection-axis="x"]')
            position.wait_for(state='visible')
            position.fill(str(float(position.input_value()) + 1))
            position.press('Enter')
        else:
            moved = page.evaluate('''() => {
                const selection = VibeMolEdit.resolveSelection({ kind: 'all' });
                return VibeMolEdit.translate(selection.value, [0.25, -0.5, 1]);
            }''')
            assert moved['ok'] and moved['value']['operation'] == 'translate', moved
        after = volume(page)
        assert before['atoms'] != after['atoms'], label
        actual = vector_bits(page)
        print('[vector-translation] ' + json.dumps({
            'path': label, 'actual': actual, 'expected': original,
        }), flush=True)
        assert actual == original, (label, actual, original)
        check_undo_redo(original, original, perturb_vectors=True)

    before = load_fixture('nickel-coordination-vectors.xyz', METAL_VECTORS)
    original = vector_bits(page)
    nickel = before['atoms'][0]['id']
    ligands = {atom['id'] for atom in before['atoms'][1:]}
    assert {frozenset((bond['a'], bond['b'])) for bond in before['bonds']} == {
        frozenset((nickel, ligand)) for ligand in ligands
    }, before['bonds']
    assert page.evaluate('() => VibeMolTesting.setEditSelectionIndices([0])')
    page.locator('#editSelectionCoordinationCueButton').click()
    popup = page.locator('#editSelectionCoordinationCuePopover')
    popup.locator('[data-coordination-choice="tetrahedral"]').click()
    after = volume(page)
    assert after['annotations']['coordination']['byAtomId'][nickel]['geometryId'] == 'tetrahedral', after['annotations']
    compare_ligand_vectors(before, after)
    rotated = vector_bits(page)
    assert rotated != original
    page.locator('#canvas').focus()
    check_undo_redo(original, rotated, states=(before, after))
