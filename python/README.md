# VibeMol notebook widget

`vibemol.Viewer` embeds VibeMol in a notebook, sends commands to the viewer, and mirrors Edit selection and Calculations state back to the Python kernel.

Install from the repository root in the environment used by your notebook kernel.

```bash
pip install -e python
```

Use a compatible VibeMol server. `Viewer()` defaults to `https://vibemol.org/` and requires the [embed bridge](../docs/api/embed.md) to be present on that server. To run this checkout locally, serve the repository root in a separate terminal.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then create and display the widget.

```python
from vibemol import Viewer

viewer = Viewer(source="local")
display(viewer)
loading = viewer.load("assets/fragments/water.xyz")
```

The file path above is relative to a notebook opened at the repository root. You can pass paths, `{"name": ..., "text": ...}` or `{"name": ..., "base64": ...}` dictionaries, `(name, text)` pairs or lists of these forms. Use `local_port` for a different local port, or `url` for an explicit HTTP(S) VibeMol address.

### Read a result in a later cell

The kernel processes the browser's responses and selection updates asynchronously after the current cell finishes. A blocking wait in the cell would prevent its reply from arriving. Run the following in a later cell after the molecule appears.

```python
print(viewer.ready, viewer.app_info["appVersion"])
print(loading.result())
```

`viewer.run(command, **params)` and `viewer.load(...)` return a `CommandFuture`. Call `.done()` to check whether the reply arrived, or use `.add_done_callback(fn)` to react when it arrives. `.result()` raises `PendingResult` while the request is pending and `CommandError` for a command or transport error. See the [command reference](../docs/api/commands.md).

After making a selection in Edit mode, read `viewer.selection` from the next cell. `viewer.calculations` mirrors the Calculations state. Each widget instance displays one live viewer.

### Notebook environments

Open the notebook with widget support enabled. anywidget supports JupyterLab, Jupyter Notebook 7, VS Code notebooks and Colab. In Colab, enable its custom widget manager before displaying the Viewer. An HTTPS notebook may block an HTTP VibeMol frame as mixed content. Use an HTTPS VibeMol URL from an HTTPS notebook, or run both the notebook and VibeMol locally in the same browser. [anywidget documentation](https://anywidget.dev/)

### Demo

Open [viewer_demo.ipynb](examples/viewer_demo.ipynb) with the local server running. The fixture is a cyclopropene CASSCF(4,3)/STO-3G calculation exported with `forte2.write_molden`, retaining the three active orbitals. The demo reads a two-carbon selection, then uses all three carbons and their whole 2p shells to prepare the forte2 π-plane AVAS arguments.
