/**
 * SlashCommandPopover — F-018 popover UI 검증.
 *
 * Spec: docs/ux/patterns/F-018-slash-commands.md
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  SlashCommandPopover,
  commandOptionId,
} from '../../src/renderer/components/chat/SlashCommandPopover';
import {
  SLASH_COMMANDS,
  type SlashCommand,
} from '../../src/renderer/commands/registry';

const cmds = SLASH_COMMANDS;

describe('SlashCommandPopover', () => {
  it('renders nothing when commands is empty', () => {
    const { container } = render(
      <SlashCommandPopover commands={[]} activeIndex={0} onPick={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all provided commands', () => {
    render(<SlashCommandPopover commands={cmds} activeIndex={0} onPick={() => {}} />);
    for (const cmd of cmds) {
      expect(
        screen.getByTestId(`slash-command-option-${cmd.id}`)
      ).toBeInTheDocument();
    }
  });

  it('marks the active item with aria-selected="true"', () => {
    render(
      <SlashCommandPopover
        commands={cmds}
        activeIndex={2}
        onPick={() => {}}
      />
    );
    const activeId = cmds[2]?.id;
    expect(activeId).toBeDefined();
    if (activeId === undefined) return;
    const item = screen.getByTestId(`slash-command-option-${activeId}`);
    expect(item).toHaveAttribute('aria-selected', 'true');
    expect(item).toHaveAttribute('data-active', 'true');
  });

  it('non-active items have aria-selected="false"', () => {
    render(
      <SlashCommandPopover
        commands={cmds}
        activeIndex={0}
        onPick={() => {}}
      />
    );
    const others = cmds.slice(1);
    for (const cmd of others) {
      const item = screen.getByTestId(`slash-command-option-${cmd.id}`);
      expect(item).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('calls onPick on mousedown (preventDefault keeps focus)', () => {
    const onPick = vi.fn<(cmd: SlashCommand) => void>();
    render(<SlashCommandPopover commands={cmds} activeIndex={0} onPick={onPick} />);
    const item = screen.getByTestId('slash-command-option-help');
    fireEvent.mouseDown(item);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0].id).toBe('help');
  });

  it('has role="listbox" with Korean aria-label', () => {
    render(<SlashCommandPopover commands={cmds} activeIndex={0} onPick={() => {}} />);
    const box = screen.getByTestId('slash-command-popover');
    expect(box).toHaveAttribute('role', 'listbox');
    expect(box).toHaveAttribute('aria-label', '슬래시 명령');
  });

  it('item ids match commandOptionId() for aria-activedescendant linkage', () => {
    render(
      <SlashCommandPopover
        commands={cmds}
        activeIndex={0}
        onPick={() => {}}
        idPrefix="custom-prefix"
      />
    );
    const helpCmd = cmds.find((c) => c.id === 'help');
    expect(helpCmd).toBeDefined();
    if (helpCmd === undefined) return;
    const item = screen.getByTestId('slash-command-option-help');
    expect(item).toHaveAttribute('id', commandOptionId('custom-prefix', helpCmd));
  });

  it('shows argHint for /model', () => {
    render(<SlashCommandPopover commands={cmds} activeIndex={0} onPick={() => {}} />);
    const modelItem = screen.getByTestId('slash-command-option-model');
    expect(modelItem.textContent ?? '').toContain('<모델명>');
  });
});
