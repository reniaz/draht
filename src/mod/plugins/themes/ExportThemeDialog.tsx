import type { FC } from '../../../lib/teact/teact';
import { memo, useEffect, useState } from '../../../lib/teact/teact';

import Button from '../../../components/ui/Button';
import InputText from '../../../components/ui/InputText';
import Modal from '../../../components/ui/Modal';

type OwnProps = {
  isOpen: boolean;
  defaultName: string;
  defaultAuthor: string;
  onExport: (name: string, author: string) => void;
  onClose: NoneToVoidFunction;
};

/**
 * Asks what to call a theme before writing it out.
 *
 * The name is what the theme is listed as once someone drops the file in their themes
 * folder, so exporting silently as "My theme" means every shared theme arrives with the
 * same name.
 */
const ExportThemeDialog: FC<OwnProps> = ({
  isOpen, defaultName, defaultAuthor, onExport, onClose,
}) => {
  const [name, setName] = useState(defaultName);
  const [author, setAuthor] = useState(defaultAuthor);

  // Reset each time it opens, so a cancelled export does not leave its half-typed name
  // behind for the next one.
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setAuthor(defaultAuthor);
    }
  }, [isOpen, defaultName, defaultAuthor]);

  const trimmed = name.trim();

  return (
    <Modal isOpen={isOpen} title="Export theme" hasCloseButton onClose={onClose}>
      <InputText
        label="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <InputText
        label="Author"
        value={author}
        onChange={(e) => setAuthor(e.currentTarget.value)}
      />

      <div className="dialog-buttons">
        <Button className="confirm-dialog-button" isText onClick={onClose}>Cancel</Button>
        <Button
          className="confirm-dialog-button"
          isText
          disabled={!trimmed}
          onClick={() => onExport(trimmed, author)}
        >
          Export
        </Button>
      </div>
    </Modal>
  );
};

export default memo(ExportThemeDialog);
